import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface SubscriptionTierFeatures {
  features: string[];
}

export interface SubscriptionTierLimits {
  /** Maximum administrators allowed per channel. */
  maxAdmins?: number;
  /** Maximum products allowed per channel. Not enforced yet. */
  maxProducts?: number;
  /** Maximum stock locations allowed per channel. Not enforced yet. */
  maxStockLocations?: number;
  /** Maximum orders allowed per 30-day period. Not enforced yet. */
  maxOrdersPerMonth?: number;
  /** SMS credits per channel per 30-day period. Null/0 = no limit. */
  smsPerPeriod?: number;
}

@Entity()
export class SubscriptionTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('int')
  priceMonthly: number;

  @Column('int')
  priceYearly: number;

  @Column('jsonb', { nullable: true })
  features: SubscriptionTierFeatures;

  /** @deprecated Use limits.smsPerPeriod instead. Kept for migration fallback. */
  @Column('int', { default: 0, nullable: true })
  smsLimit: number | null;

  /** Numeric entitlement limits for this tier. */
  @Column('jsonb', { nullable: true })
  limits: SubscriptionTierLimits | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
