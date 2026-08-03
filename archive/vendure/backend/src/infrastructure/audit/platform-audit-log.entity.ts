import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Platform (super-admin) audit log entity.
 * Stores platform-level actions that are not scoped to a channel.
 * Same shape as AuditLog minus channelId; separate table for clear scope separation.
 */
@Entity('platform_audit_log')
@Index(['timestamp'])
@Index(['eventType'])
@Index(['userId'])
@Index(['entityType', 'entityId'])
export class PlatformAuditLog {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @PrimaryColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @Column({ type: 'varchar' })
  eventType: string;

  @Column({ type: 'varchar', nullable: true })
  entityType: string | null;

  @Column({ type: 'varchar', nullable: true })
  entityId: string | null;

  @Column('integer', { nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', nullable: true })
  @Index(['ipAddress'])
  ipAddress: string | null;

  @Column('jsonb')
  data: Record<string, any>;

  @Column({ type: 'varchar' })
  source: string; // e.g. 'super_admin'
}
