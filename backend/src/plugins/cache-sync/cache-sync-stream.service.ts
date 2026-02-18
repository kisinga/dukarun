import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, OrderEvent, ProductEvent, RequestContext } from '@vendure/core';
import { Observable, Subject } from 'rxjs';
import { PaymentMethodChangedEvent } from '../../infrastructure/events/cache-invalidation.events';
import { CacheSyncRecentBufferService } from './cache-sync-recent-buffer.service';
import type { CacheSyncMessage } from './cache-sync.types';

/**
 * Vendure CustomerEvent - entity event for Customer (created, updated, deleted).
 * Vendure 3.x exports this from @vendure/core.
 */
interface CustomerEventLike {
  type: 'created' | 'updated' | 'deleted';
  entity: { id: string };
  ctx: RequestContext;
}

/**
 * ProductVariantEvent entity shape (variant has productId for parent product).
 */
interface ProductVariantEventLike {
  type: 'created' | 'updated' | 'deleted';
  entity: { id: string; productId?: string };
  ctx: RequestContext;
}

/**
 * Multicasts entity change events to SSE clients. Subscribes to EventBus
 * (ProductEvent, ProductVariantEvent, CustomerEvent, PaymentMethodChangedEvent) and pushes
 * CacheSyncMessage to a single Subject and to the recent buffer for catch-up on reconnect.
 * ProductVariantEvent (e.g. variant price update) is emitted as product so frontend invalidates the product.
 */
@Injectable()
export class CacheSyncStreamService implements OnModuleInit {
  private readonly logger = new Logger(CacheSyncStreamService.name);
  private readonly message$ = new Subject<CacheSyncMessage>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly recentBuffer: CacheSyncRecentBufferService
  ) {}

  onModuleInit(): void {
    this.eventBus.ofType(ProductEvent).subscribe((event: ProductEvent) => {
      const channelId = event.ctx?.channelId?.toString();
      if (!channelId) return;
      const type = (event as unknown as { type: 'created' | 'updated' | 'deleted' }).type;
      const action = this.toAction(type);
      if (!action) return;
      const id = event.entity?.id?.toString();
      this.logger.log(
        `CacheSync: event received entityType=product action=${action} channelId=${channelId} id=${id ?? 'n/a'}`
      );
      const msg: CacheSyncMessage = { entityType: 'product', action, channelId, id };
      this.message$.next(msg);
      this.recentBuffer.push(msg).catch(() => {});
    });

    try {
      const { ProductVariantEvent } = require('@vendure/core');
      this.eventBus.ofType(ProductVariantEvent).subscribe((event: unknown) => {
        const e = event as ProductVariantEventLike;
        const channelId = e.ctx?.channelId?.toString();
        if (!channelId) return;
        const action = this.toAction(e.type);
        if (!action) return;
        const productId = e.entity?.productId?.toString();
        if (!productId) return;
        this.logger.log(
          `CacheSync: event received entityType=product (from variant) action=${action} channelId=${channelId} productId=${productId}`
        );
        const msg: CacheSyncMessage = { entityType: 'product', action, channelId, id: productId };
        this.message$.next(msg);
        this.recentBuffer.push(msg).catch(() => {});
      });
    } catch {
      this.logger.warn(
        'ProductVariantEvent not available; variant (e.g. price) cache sync disabled'
      );
    }

    this.eventBus
      .ofType(PaymentMethodChangedEvent)
      .subscribe((event: PaymentMethodChangedEvent) => {
        const channelId = event.ctx?.channelId?.toString();
        if (!channelId) return;
        this.logger.log(
          `CacheSync: event received entityType=payment_method action=${event.action} channelId=${channelId} id=${event.paymentMethodId ?? 'n/a'}`
        );
        const msg: CacheSyncMessage = {
          entityType: 'payment_method',
          action: event.action,
          channelId,
          id: event.paymentMethodId,
        };
        this.message$.next(msg);
        this.recentBuffer.push(msg).catch(() => {});
      });

    try {
      const { CustomerEvent } = require('@vendure/core');
      this.eventBus.ofType(CustomerEvent).subscribe((event: unknown) => {
        const e = event as CustomerEventLike;
        const channelId = e.ctx?.channelId?.toString();
        if (!channelId) return;
        const action = this.toAction(e.type);
        if (!action) return;
        const id = e.entity?.id?.toString();
        this.logger.log(
          `CacheSync: event received entityType=customer action=${action} channelId=${channelId} id=${id ?? 'n/a'}`
        );
        const customerMsg: CacheSyncMessage = { entityType: 'customer', action, channelId, id };
        this.message$.next(customerMsg);
        this.recentBuffer.push(customerMsg).catch(() => {});
        // Suppliers are customers; emit supplier so supplier list cache invalidates too
        const supplierMsg: CacheSyncMessage = { entityType: 'supplier', action, channelId, id };
        this.message$.next(supplierMsg);
        this.recentBuffer.push(supplierMsg).catch(() => {});
      });
    } catch {
      this.logger.warn('CustomerEvent not available; customer cache sync disabled');
    }

    this.eventBus.ofType(OrderEvent).subscribe((event: OrderEvent) => {
      const channelId = event.ctx?.channelId?.toString();
      if (!channelId) return;
      const action = this.toAction(event.type);
      if (!action) return;
      const id = event.entity?.id?.toString();
      this.logger.log(
        `CacheSync: event received entityType=order action=${action} channelId=${channelId} id=${id ?? 'n/a'}`
      );
      const msg: CacheSyncMessage = { entityType: 'order', action, channelId, id };
      this.message$.next(msg);
      this.recentBuffer.push(msg).catch(() => {});
    });
  }

  getMessageStream(): Observable<CacheSyncMessage> {
    return this.message$.asObservable();
  }

  private toAction(type: string): CacheSyncMessage['action'] | null {
    if (type === 'created' || type === 'updated' || type === 'deleted') return type;
    return null;
  }
}
