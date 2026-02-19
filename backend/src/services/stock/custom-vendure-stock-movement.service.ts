import { Inject } from '@nestjs/common';
import {
  Cancellation,
  EventBus,
  idsAreEqual,
  ListQueryBuilder,
  GlobalSettingsService,
  Release,
  RequestContext,
  Sale,
  OrderLine,
  ProductVariant,
  StockAdjustment,
  StockLevelService,
  StockLocationService,
  StockMovementEvent,
  StockMovementService,
  TransactionalConnection,
} from '@vendure/core';
import { OrderLineInput, StockLevelInput } from '@vendure/common/lib/generated-types';
import { In } from 'typeorm';
import { StockMovementService as LocalStockMovementService } from './stock-movement.service';

/**
 * Custom implementation of Vendure's StockMovementService so that:
 * - Fulfillment does not update StockLevel (our batch/COGS flow owns quantity on sale).
 * - Product create/update stock is a no-op here; all stock must go through our
 *   StockMovementService.adjustStockLevel (purchases/adjustments) so batches are created.
 *
 * This ensures a single write path for quantity and prevents "stock without batch" after
 * the backfill migration.
 */
const REASON_PRODUCT_CREATE_UPDATE = 'Product create/update';

export class CustomVendureStockMovementService extends StockMovementService {
  private readonly conn: TransactionalConnection;
  private readonly bus: EventBus;
  private readonly stockLoc: StockLocationService;
  private readonly localStock: LocalStockMovementService;

  constructor(
    connection: TransactionalConnection,
    listQueryBuilder: ListQueryBuilder,
    globalSettingsService: GlobalSettingsService,
    stockLevelService: StockLevelService,
    eventBus: EventBus,
    stockLocationService: StockLocationService,
    @Inject('LocalStockMovementService') localStock: LocalStockMovementService
  ) {
    super(
      connection,
      listQueryBuilder,
      globalSettingsService,
      stockLevelService,
      eventBus,
      stockLocationService
    );
    this.conn = connection;
    this.bus = eventBus;
    this.stockLoc = stockLocationService;
    this.localStock = localStock;
  }

  /**
   * Create Sale entities and publish event, but do not update StockLevel.
   * Our recordSale (COGS) flow consumes from batches and will sync StockLevel when we move to batch-as-source-of-truth.
   */
  override async createSalesForOrder(
    ctx: RequestContext,
    lines: OrderLineInput[]
  ): Promise<Sale[]> {
    const sales: Sale[] = [];
    const orderLines = await this.conn.getRepository(ctx, OrderLine).find({
      where: { id: In(lines.map(l => l.orderLineId)) },
    });
    for (const lineRow of lines) {
      const orderLine = orderLines.find((line: OrderLine) =>
        idsAreEqual(line.id, lineRow.orderLineId)
      );
      if (!orderLine) continue;
      const productVariant = await this.conn.getEntityOrThrow(
        ctx,
        ProductVariant,
        orderLine.productVariantId,
        { includeSoftDeleted: true }
      );
      const saleLocations = await this.stockLoc.getSaleLocations(ctx, orderLine, lineRow.quantity);
      for (const saleLocation of saleLocations) {
        const sale = new Sale({
          productVariant,
          quantity: lineRow.quantity * -1,
          orderLine,
          stockLocation: saleLocation.location,
        });
        sales.push(sale);
        // Intentionally do NOT call stockLevelService.updateStockAllocatedForLocation / updateStockOnHandForLocation
      }
    }
    const savedSales = await this.conn.getRepository(ctx, Sale).save(sales);
    if (savedSales.length) {
      await this.bus.publish(new StockMovementEvent(ctx, savedSales));
    }
    return savedSales;
  }

  /**
   * Create Cancellation entities and publish event, but do not update StockLevel.
   */
  override async createCancellationsForOrderLines(
    ctx: RequestContext,
    lineInputs: OrderLineInput[]
  ): Promise<Cancellation[]> {
    const cancellations: Cancellation[] = [];
    const orderLines = await this.conn.getRepository(ctx, OrderLine).find({
      where: { id: In(lineInputs.map(l => l.orderLineId)) },
      relations: ['productVariant'],
    });
    for (const orderLine of orderLines) {
      const lineInput = lineInputs.find(l => idsAreEqual(l.orderLineId, orderLine.id));
      if (!lineInput) continue;
      const cancellationLocations = await this.stockLoc.getCancellationLocations(
        ctx,
        orderLine,
        lineInput.quantity
      );
      for (const cancellationLocation of cancellationLocations) {
        cancellations.push(
          new Cancellation({
            productVariant: orderLine.productVariant,
            quantity: lineInput.quantity,
            orderLine,
            stockLocation: cancellationLocation.location,
          })
        );
      }
    }
    const saved = await this.conn.getRepository(ctx, Cancellation).save(cancellations);
    if (saved.length) {
      await this.bus.publish(new StockMovementEvent(ctx, saved));
    }
    return saved;
  }

  /**
   * Create Release entities and publish event, but do not update StockLevel.
   */
  override async createReleasesForOrderLines(
    ctx: RequestContext,
    lineInputs: OrderLineInput[]
  ): Promise<Release[]> {
    const releases: Release[] = [];
    const orderLines = await this.conn.getRepository(ctx, OrderLine).find({
      where: { id: In(lineInputs.map(l => l.orderLineId)) },
      relations: ['productVariant'],
    });
    for (const orderLine of orderLines) {
      const lineInput = lineInputs.find(l => idsAreEqual(l.orderLineId, orderLine.id));
      if (!lineInput) continue;
      const releaseLocations = await this.stockLoc.getReleaseLocations(
        ctx,
        orderLine,
        lineInput.quantity
      );
      for (const releaseLocation of releaseLocations) {
        releases.push(
          new Release({
            productVariant: orderLine.productVariant,
            quantity: lineInput.quantity,
            orderLine,
            stockLocation: releaseLocation.location,
          })
        );
      }
    }
    const saved = await this.conn.getRepository(ctx, Release).save(releases);
    if (saved.length) {
      await this.bus.publish(new StockMovementEvent(ctx, saved));
    }
    return saved;
  }

  /**
   * Delegate to local StockMovementService.adjustStockLevel so product create/update
   * uses the same write path as purchases/adjustments and batches are created.
   */
  override async adjustProductVariantStock(
    ctx: RequestContext,
    productVariantId: unknown,
    stockOnHandNumberOrInput: number | StockLevelInput[]
  ): Promise<StockAdjustment[]> {
    const variantId = productVariantId as string;
    let stockOnHandInputs: Array<{ stockLocationId: string; stockOnHand: number }>;
    if (typeof stockOnHandNumberOrInput === 'number') {
      const defaultLocation = await this.stockLoc.defaultStockLocation(ctx);
      stockOnHandInputs = [
        { stockLocationId: defaultLocation.id as string, stockOnHand: stockOnHandNumberOrInput },
      ];
    } else {
      stockOnHandInputs = stockOnHandNumberOrInput.map(input => ({
        stockLocationId: input.stockLocationId as string,
        stockOnHand: input.stockOnHand,
      }));
    }

    for (const input of stockOnHandInputs) {
      const current = await this.localStock.getCurrentStock(ctx, variantId, input.stockLocationId);
      const delta = input.stockOnHand - current;
      if (delta === 0) continue;
      await this.localStock.adjustStockLevel(
        ctx,
        variantId,
        input.stockLocationId,
        delta,
        REASON_PRODUCT_CREATE_UPDATE
      );
    }

    return [];
  }
}
