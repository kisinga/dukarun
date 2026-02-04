import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cashier_session')
@Index(['channelId', 'openedAt'])
export class CashierSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'int' })
  cashierUserId!: number;

  @Column({ type: 'timestamp' })
  openedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt?: Date | null;

  @Column({ type: 'bigint', default: '0' })
  closingDeclared!: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'closed';
}
