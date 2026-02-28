import { Column, Entity, PrimaryColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Reconciliation } from './reconciliation.entity';
import { Account } from '../../ledger/account.entity';

/**
 * Junction: which accounts a reconciliation covers (freeze-frame scope).
 * declaredAmountCents: per-account declared amount at opening/closing (nullable for legacy).
 * expectedAmountCents, varianceCents: persisted at create time for audit; variance = declared - expected (nullable for legacy).
 */
@Entity('reconciliation_account')
@Index('IDX_reconciliation_account_reconciliationId', ['reconciliationId'])
@Index('IDX_reconciliation_account_accountId', ['accountId'])
export class ReconciliationAccount {
  @PrimaryColumn({ type: 'uuid' })
  reconciliationId!: string;

  @PrimaryColumn({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'bigint', nullable: true })
  declaredAmountCents?: string | null;

  @Column({ type: 'bigint', nullable: true })
  expectedAmountCents?: string | null;

  @Column({ type: 'bigint', nullable: true })
  varianceCents?: string | null;

  @ManyToOne(() => Reconciliation, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'reconciliationId',
    foreignKeyConstraintName: 'FK_reconciliation_account_reconciliation',
  })
  reconciliation!: Reconciliation;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'accountId',
    foreignKeyConstraintName: 'FK_reconciliation_account_account',
  })
  account!: Account;
}
