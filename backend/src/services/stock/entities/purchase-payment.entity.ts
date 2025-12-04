import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Customer } from '@vendure/core';
import { StockPurchase } from './purchase.entity';

/**
 * Purchase Payment Entity
 *
 * Tracks payments made to suppliers for credit purchases.
 * This is for audit trail and convenience - the ledger is the source of truth.
 */
@Entity('purchase_payment')
@Index('IDX_purchase_payment_purchase', ['purchaseId'])
@Index('IDX_purchase_payment_supplier', ['supplierId', 'paidAt'])
export class PurchasePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  channelId: number;

  @Column({ type: 'uuid' })
  purchaseId: string;

  @ManyToOne(() => StockPurchase)
  purchase: StockPurchase;

  @Column({ type: 'bigint' })
  amount: number; // In smallest currency unit (cents)

  @Column({ type: 'varchar', length: 64 })
  method: string; // Payment method code (cash-payment, mpesa-payment, etc.)

  @Column({ type: 'varchar', length: 128, nullable: true })
  reference: string | null; // External reference (receipt number, etc.)

  @Column({ type: 'timestamp', default: () => 'now()' })
  paidAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any> | null; // Additional metadata

  @Column({ type: 'integer' })
  supplierId: number; // Denormalized for quick queries

  @ManyToOne(() => Customer)
  supplier: Customer;
}
