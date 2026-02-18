import { Channel, ProductVariant, StockLocation } from '@vendure/core';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Inventory Batch Entity
 *
 * Tracks batches of stock with cost and expiry information.
 * Batches are immutable once created - new movements create new batches.
 *
 * Invariants:
 * - quantity >= 0
 * - Batches are channel-scoped
 * - sourceType + sourceId provide idempotency
 */
@Entity('inventory_batch')
@Check('CHK_inventory_batch_quantity_non_negative', '"quantity" >= 0')
@Index('IDX_inventory_batch_channel_location_variant_created', [
  'channelId',
  'stockLocationId',
  'productVariantId',
  'createdAt',
])
@Index('IDX_inventory_batch_channel_source', ['channelId', 'sourceType', 'sourceId'])
@Index('IDX_inventory_batch_expiry', ['expiryDate'])
export class InventoryBatch {
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

  @Column({ type: 'float' })
  quantity!: number;

  @Column({ type: 'bigint' })
  unitCost!: number; // in cents

  @Column({ type: 'timestamp', nullable: true })
  expiryDate!: Date | null;

  @Column({ type: 'varchar', length: 64 })
  sourceType!: string; // e.g., 'Purchase', 'Adjustment', 'Transfer'

  @Column({ type: 'varchar', length: 255 })
  sourceId!: string; // e.g., purchase ID, adjustment ID

  /** Optional supplier lot or batch number for traceability */
  @Column({ type: 'varchar', length: 128, nullable: true })
  batchNumber!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
