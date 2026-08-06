import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Audit Log Entity
 *
 * Stores all audited events with channel scoping and user attribution.
 * Time-series optimized for efficient querying with TimescaleDB.
 *
 * Note: Uses composite primary key (id, timestamp) for TimescaleDB hypertable.
 * The timestamp is the partitioning dimension for the hypertable.
 */
@Entity('audit_log')
@Index(['channelId', 'timestamp'])
@Index(['channelId', 'entityType', 'entityId'])
@Index(['channelId', 'userId'])
export class AuditLog {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @PrimaryColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @Column('integer')
  channelId: number; // Vendure channel ID (numeric), required, indexed

  @Column({ type: 'varchar' })
  eventType: string; // e.g., 'order.created', 'user.created'

  @Column({ type: 'varchar', nullable: true })
  entityType: string | null; // e.g., 'Order', 'User'

  @Column({ type: 'varchar', nullable: true })
  entityId: string | null;

  @Column('integer', { nullable: true })
  userId: number | null; // Vendure user ID (numeric), who performed the action

  @Column({ type: 'varchar', nullable: true })
  @Index(['ipAddress'])
  ipAddress: string | null; // Client IP address (from reverse proxy headers or direct connection)

  @Column('jsonb')
  data: Record<string, any>; // Flexible event data

  @Column({ type: 'varchar' })
  source: 'user_action' | 'system_event';
}
