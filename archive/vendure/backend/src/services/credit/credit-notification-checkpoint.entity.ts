import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Idempotency checkpoint for credit-related notifications.
 *
 * Prevents the same reminder bucket from being sent to the same customer
 * more than once.
 */
@Entity()
@Index('IDX_credit_notification_checkpoint_lookup', ['customerId', 'triggerKey', 'bucket'], {
  unique: true,
})
export class CreditNotificationCheckpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column()
  triggerKey: string;

  @Column()
  bucket: string;

  @CreateDateColumn()
  sentAt: Date;
}
