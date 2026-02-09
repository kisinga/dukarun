import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ApprovalRequest Entity
 *
 * Generic approval workflow entity. Stores requests for actions
 * that require oversight (overdraft, credit approval, etc.).
 *
 * The `metadata` JSONB column holds type-specific data (e.g., form state,
 * account details, amounts) so the schema stays stable across approval types.
 */
@Entity('approval_request')
@Index('IDX_approval_request_channel', ['channelId'])
@Index('IDX_approval_request_status', ['channelId', 'status'])
@Index('IDX_approval_request_requester', ['channelId', 'requestedById'])
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  channelId: number;

  @Column({ type: 'varchar', length: 50 })
  type: string; // 'overdraft' | 'customer_credit' | 'below_wholesale' | 'order_reversal'

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string; // 'pending' | 'approved' | 'rejected'

  @Column({ type: 'varchar' })
  requestedById: string;

  @Column({ type: 'varchar', nullable: true })
  reviewedById: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @Column({ type: 'varchar', nullable: true })
  entityType: string | null; // 'purchase', 'order', 'customer'

  @Column({ type: 'varchar', nullable: true })
  entityId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
