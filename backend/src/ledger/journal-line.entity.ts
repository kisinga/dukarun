import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { JournalEntry } from './journal-entry.entity';
import { Account } from './account.entity';

@Entity('ledger_journal_line')
@Index(['entryId'])
@Index('IDX_journal_line_account_channel_date', ['accountId', 'channelId'])
// Define GIN indexes as regular indexes so TypeORM recognizes them
// Migration 1766000500000-EnsureGinIndexes will convert them to GIN indexes
@Index('IDX_journal_line_meta_customer', ['meta'], { where: `"meta"->>'customerId' IS NOT NULL` })
@Index('IDX_journal_line_meta_supplier', ['meta'], { where: `"meta"->>'supplierId' IS NOT NULL` })
@Index('IDX_journal_line_meta_open_session', ['meta'], {
  where: `"meta"->>'openSessionId' IS NOT NULL`,
})
export class JournalLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  entryId!: string;

  @ManyToOne(() => JournalEntry, e => e.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entryId' })
  entry!: JournalEntry;

  @Column({ type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accountId' })
  account!: Account;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'bigint', default: 0 })
  debit!: string; // store in smallest currency unit as string to avoid precision loss

  @Column({ type: 'bigint', default: 0 })
  credit!: string; // store in smallest currency unit as string

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any> | null;
}
