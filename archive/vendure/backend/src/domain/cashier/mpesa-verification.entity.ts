import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * M-Pesa Verification
 *
 * Records cashier verification of M-Pesa transactions during a session.
 * Since M-Pesa goes to a business till (not cashier's control),
 * this is a confirmation check, not a declaration.
 */
@Entity('mpesa_verification')
@Index(['channelId', 'sessionId'])
export class MpesaVerification {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'int' })
    channelId!: number;

    @Column({ type: 'uuid' })
    sessionId!: string;

    @Column({ type: 'timestamp' })
    verifiedAt!: Date;

    @Column({ type: 'int' })
    transactionCount!: number;

    @Column({ type: 'boolean' })
    allConfirmed!: boolean;

    // JSON array of transaction IDs that cashier flagged as not received
    @Column({ type: 'text', nullable: true })
    flaggedTransactionIds?: string | null;

    @Column({ type: 'text', nullable: true })
    notes?: string | null;

    @Column({ type: 'int' })
    verifiedByUserId!: number;
}

