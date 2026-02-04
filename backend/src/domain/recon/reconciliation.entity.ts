import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ReconciliationScope = 'cash-session' | 'method' | 'bank' | 'inventory' | 'manual';
export type ReconciliationStatus = 'draft' | 'verified';

@Entity('reconciliation')
@Index(['channelId', 'rangeStart', 'rangeEnd'])
export class Reconciliation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'varchar', length: 32 })
  scope!: ReconciliationScope;

  /** When scope=cash-session then sessionId; when scope=method then payment method code; when scope=bank then payoutId; when scope=inventory then stockLocationId or 'ALL'. */
  @Column({ type: 'varchar', length: 64 })
  scopeRefId!: string;

  @Column({ type: 'date' })
  rangeStart!: string;

  @Column({ type: 'date' })
  rangeEnd!: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: ReconciliationStatus;

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalRef?: string | null; // bank/payout id

  @Column({ type: 'bigint', default: 0 })
  varianceAmount!: string; // smallest unit

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'int' })
  createdBy!: number;

  @Column({ type: 'int', nullable: true })
  reviewedBy?: number | null;

  @Column({ type: 'bigint', nullable: true })
  expectedBalance?: string | null; // Expected balance from ledger/inventory (smallest currency unit)

  @Column({ type: 'bigint', nullable: true })
  actualBalance?: string | null; // Actual balance from reconciliation (smallest currency unit)
}
