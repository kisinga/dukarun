import { Channel, ProductVariant, StockLocation, User } from '@vendure/core';
import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Inventory Stock Adjustment Entity
 * Custom entity that extends Vendure's StockAdjustment functionality
 * Adds: reason tracking, notes, line items with previous/new stock values
 */
@Entity('inventory_stock_adjustment')
export class InventoryStockAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  channelId: number;

  @ManyToOne(() => Channel)
  channel: Channel;

  @Column({ type: 'varchar' })
  reason: string; // 'damage', 'loss', 'found', 'correction', etc.

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'integer', nullable: true })
  adjustedByUserId: number | null;

  @ManyToOne(() => User, { nullable: true })
  adjustedBy: User | null;

  @OneToMany(() => InventoryStockAdjustmentLine, line => line.adjustment, { cascade: true })
  lines: InventoryStockAdjustmentLine[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

/**
 * Inventory Stock Adjustment Line Entity
 * Represents a line item in an inventory stock adjustment
 */
@Entity('inventory_stock_adjustment_line')
export class InventoryStockAdjustmentLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adjustmentId: string;

  @ManyToOne(() => InventoryStockAdjustment, adjustment => adjustment.lines, {
    onDelete: 'CASCADE',
  })
  adjustment: InventoryStockAdjustment;

  @Column({ type: 'integer' })
  variantId: number;

  @ManyToOne(() => ProductVariant)
  variant: ProductVariant;

  @Column({ type: 'float' })
  quantityChange: number; // Positive for increase, negative for decrease

  @Column({ type: 'float' })
  previousStock: number;

  @Column({ type: 'float' })
  newStock: number;

  @Column({ type: 'integer' })
  stockLocationId: number;

  @ManyToOne(() => StockLocation)
  stockLocation: StockLocation;
}
