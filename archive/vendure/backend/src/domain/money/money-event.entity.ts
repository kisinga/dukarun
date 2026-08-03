import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type MoneyEventType =
  | 'bank_deposit'
  | 'petty_cash_expense'
  | 'processor_fee'
  | 'chargeback'
  | 'variance_adjustment';

@Entity('money_event')
@Unique('uq_money_event_source', ['channelId', 'sourceType', 'sourceId'])
export class MoneyEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'date' })
  eventDate!: string; // YYYY-MM-DD

  @Column({ type: 'varchar', length: 64 })
  type!: MoneyEventType;

  @Column({ type: 'bigint' })
  amount!: string; // smallest currency unit

  @Column({ type: 'varchar', length: 64, nullable: true })
  paymentMethodCode?: string | null;

  @Column({ type: 'uuid', nullable: true })
  cashierSessionId?: string | null;

  @Column({ type: 'varchar', length: 64 })
  sourceType!: string; // e.g., 'Manual', 'Reconciliation', 'SessionClose'

  @Column({ type: 'varchar', length: 64 })
  sourceId!: string;

  @Column({ type: 'text', nullable: true })
  memo?: string | null;

  @Column({ type: 'int', nullable: true })
  postedByUserId?: number | null;

  @Column({ type: 'uuid', nullable: true })
  reversalOf?: string | null;

  @Column({ type: 'uuid', nullable: true })
  auditId?: string | null;
}
