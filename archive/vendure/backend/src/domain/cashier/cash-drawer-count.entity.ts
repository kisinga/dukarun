import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CashCountType = 'opening' | 'interim' | 'closing';

/**
 * Cash Drawer Count
 *
 * Records a physical cash count taken during a cashier session.
 * Implements blind count principle: cashier declares without seeing expected.
 * Variance is calculated internally and hidden until manager review.
 */
@Entity('cash_drawer_count')
@Index(['channelId', 'sessionId'])
@Index(['channelId', 'reviewedByUserId'], { where: '"reviewedByUserId" IS NULL' }) // For pending reviews query
export class CashDrawerCount {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'int' })
    channelId!: number;

    @Column({ type: 'uuid' })
    sessionId!: string;

    @Column({ type: 'varchar', length: 16 })
    countType!: CashCountType;

    @Column({ type: 'timestamp' })
    takenAt!: Date;

    // Cashier's declaration (what they say is there)
    @Column({ type: 'bigint' })
    declaredCash!: string;

    // System calculated (hidden from cashier until review)
    @Column({ type: 'bigint' })
    expectedCash!: string;

    @Column({ type: 'bigint' })
    variance!: string;

    // Resolution
    @Column({ type: 'text', nullable: true })
    varianceReason?: string | null;

    @Column({ type: 'int', nullable: true })
    reviewedByUserId?: number | null;

    @Column({ type: 'timestamp', nullable: true })
    reviewedAt?: Date | null;

    @Column({ type: 'text', nullable: true })
    reviewNotes?: string | null;

    @Column({ type: 'int' })
    countedByUserId!: number;
}

