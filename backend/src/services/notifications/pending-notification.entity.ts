import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * WhatsApp messages that were generated outside the allowed send window.
 *
 * Flushed by the morning scheduled task so customers are not woken up by
 * system-generated messages.
 */
@Entity()
@Index('IDX_pending_notification_scheduled', ['sentAt', 'scheduledAt'])
export class PendingNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  channelId: string;

  @Column()
  triggerKey: string;

  @Column()
  recipient: string;

  @Column('text')
  body: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
