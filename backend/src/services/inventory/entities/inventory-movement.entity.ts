import { Channel, ProductVariant, StockLocation } from '@vendure/core';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InventoryBatch } from './inventory-batch.entity';

/**
 * Movement types for inventory operations
 */
export enum MovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  WRITE_OFF = 'WRITE_OFF',
  EXPIRY = 'EXPIRY',
}

/**
 * Inventory Movement Entity
 *
 * Immutable audit trail of all stock changes.
 * Movements are never modified once created.
 *
 * Invariants:
 * - Immutable once created
 * - sum of movements = current stock
 * - sourceType + sourceId provide idempotency
 */
@Entity('inventory_movement')
@Index('IDX_inventory_movement_channel_location_variant_created', [
  'channelId',
  'stockLocationId',
  'productVariantId',
  'createdAt',
])
@Index(
  'UQ_inventory_movement_source',
  ['channelId', 'sourceType', 'sourceId', 'productVariantId', 'batchId', 'orderLineId', 'movementType'],
  { unique: true }
)
@Index('IDX_inventory_movement_batch', ['batchId'])
@Index('IDX_inventory_movement_type', ['movementType'])
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'integer' })
  channelId!: number;

  @ManyToOne(() => Channel)
  channel!: Channel;

  @Column({ type: 'integer' })
  stockLocationId!: number;

  @ManyToOne(() => StockLocation)
  stockLocation!: StockLocation;

  @Column({ type: 'integer' })
  productVariantId!: number;

  @ManyToOne(() => ProductVariant)
  productVariant!: ProductVariant;

  @Column({ type: 'varchar', length: 32 })
  movementType!: MovementType;

  @Column({ type: 'float' })
  quantity!: number; // positive for increases, negative for decreases

  /** Unit cost in cents at the time of the movement. Null = unknown (e.g. batch-less adjustments). */
  @Column({ type: 'bigint', nullable: true })
  unitCostCents!: number | null;

  /** Total cost in cents: round(|quantity| * unitCostCents), signed like quantity. Null = unknown. */
  @Column({ type: 'bigint', nullable: true })
  totalCostCents!: number | null;

  @Column({ type: 'uuid', nullable: true })
  batchId!: string | null;

  @ManyToOne(() => InventoryBatch, { nullable: true })
  batch!: InventoryBatch | null;

  /** Vendure OrderLine id for SALE movements (and their reversals). Plain column per codebase convention — no FK to Vendure tables. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  orderLineId!: string | null;

  /** For reversal movements: the sale movement this row restores. */
  @Column({ type: 'uuid', nullable: true })
  reversesMovementId!: string | null;

  @ManyToOne(() => InventoryMovement, { nullable: true })
  reversesMovement!: InventoryMovement | null;

  @Column({ type: 'varchar', length: 64 })
  sourceType!: string; // e.g., 'Purchase', 'Order', 'Adjustment'

  @Column({ type: 'varchar', length: 255 })
  sourceId!: string; // plain id of the source entity (purchase ID, order ID, adjustment ID)

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
