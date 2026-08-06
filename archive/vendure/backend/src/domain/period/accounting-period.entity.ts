import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Accounting Period Entity
 *
 * Tracks accounting period metadata for period end closing.
 * Each period represents a time range that can be closed after reconciliation.
 */
@Entity('accounting_period')
@Index(['channelId', 'startDate', 'endDate'])
export class AccountingPeriod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'date' })
  startDate!: string; // Period start date (inclusive)

  @Column({ type: 'date' })
  endDate!: string; // Period end date (inclusive)

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'closed';

  @Column({ type: 'int', nullable: true })
  closedBy?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt?: Date | null;
}
