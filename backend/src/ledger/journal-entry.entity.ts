import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { JournalLine } from './journal-line.entity';

@Entity('ledger_journal_entry')
@Unique('uq_journal_entry_source', ['channelId', 'sourceType', 'sourceId'])
@Index('IDX_journal_entry_channel_date', ['channelId', 'entryDate'])
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'date' })
  entryDate!: string; // YYYY-MM-DD

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  postedAt!: Date;

  @Column({ type: 'varchar', length: 64 })
  sourceType!: string; // e.g., 'Payment', 'MoneyEvent'

  @Column({ type: 'varchar', length: 128 })
  sourceId!: string; // external id (Payment.id, composite e.g. sessionId-accountCode-countId)

  @Column({ type: 'varchar', length: 16, default: 'posted' })
  status!: 'posted';

  @Column({ type: 'uuid', nullable: true })
  reversalOf?: string | null;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @OneToMany(() => JournalLine, line => line.entry, { cascade: true })
  lines!: JournalLine[];
}
