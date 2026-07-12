import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  BatchMessageAudience,
  BatchMessageChannels,
  BatchMessageFailureEntry,
  BatchMessageStatus,
} from './batch-message.types';

/**
 * A platform-wide batch messaging campaign created by a super-admin.
 * The actual delivery is performed asynchronously by the worker process.
 */
@Entity()
@Index('idx_batch_message_status', ['status'])
@Index('idx_batch_message_createdAt', ['createdAt'])
export class BatchMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 32 })
  audience: BatchMessageAudience;

  @Column({ type: 'jsonb', nullable: true })
  channelIds: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  customUserIds: string[] | null;

  @Column({ type: 'jsonb' })
  channels: BatchMessageChannels;

  @Column({ type: 'varchar', length: 16 })
  status: BatchMessageStatus;

  @Column({ type: 'integer', default: 0 })
  recipientCount: number;

  @Column({ type: 'integer', default: 0 })
  sentCount: number;

  @Column({ type: 'integer', default: 0 })
  failedCount: number;

  @Column({ type: 'jsonb', nullable: true })
  failureLog: BatchMessageFailureEntry[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;
}
