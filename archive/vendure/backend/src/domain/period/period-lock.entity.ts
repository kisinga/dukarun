import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('period_lock')
@Unique('uq_period_lock_channel', ['channelId'])
export class PeriodLock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  channelId!: number;

  @Column({ type: 'date', nullable: true })
  lockEndDate?: string | null; // inclusive; deny postings with entryDate <= lockEndDate

  @Column({ type: 'int', nullable: true })
  lockedByUserId?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  lockedAt?: Date | null;
}
