import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Admin auth event: login attempt or rate-limit hit.
 * Stored in audit DB for security review and abuse prevention.
 */
@Entity('admin_login_attempt')
@Index(['timestamp'])
@Index(['ipAddress'])
@Index(['username'])
export class AdminLoginAttempt {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', default: 'login' })
  eventKind: 'login' | 'otp_rate_limited';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  @Column({ type: 'integer', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar' })
  authMethod: 'native' | 'otp';

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'boolean', nullable: true })
  isSuperAdmin: boolean | null;
}
