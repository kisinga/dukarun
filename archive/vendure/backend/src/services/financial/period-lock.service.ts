import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PeriodLock } from '../../domain/period/period-lock.entity';

/**
 * Period Lock Service
 *
 * Manages period locks for preventing modifications to closed periods.
 */
@Injectable()
export class PeriodLockService {
  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Create period lock
   */
  async createPeriodLock(
    ctx: RequestContext,
    channelId: number,
    lockEndDate: string,
    lockedByUserId: number
  ): Promise<PeriodLock> {
    const periodLockRepo = this.connection.getRepository(ctx, PeriodLock);

    // Check if lock already exists
    const existing = await periodLockRepo.findOne({
      where: { channelId },
    });

    if (existing) {
      // Update existing lock
      existing.lockEndDate = lockEndDate;
      existing.lockedByUserId = lockedByUserId;
      existing.lockedAt = new Date();
      return periodLockRepo.save(existing);
    }

    // Create new lock
    const lock = periodLockRepo.create({
      channelId,
      lockEndDate,
      lockedByUserId,
      lockedAt: new Date(),
    });

    return periodLockRepo.save(lock);
  }

  /**
   * Get period lock for channel
   */
  async getPeriodLock(ctx: RequestContext, channelId: number): Promise<PeriodLock | null> {
    const periodLockRepo = this.connection.getRepository(ctx, PeriodLock);
    return periodLockRepo.findOne({
      where: { channelId },
    });
  }

  /**
   * Check if a date is locked
   */
  async isDateLocked(ctx: RequestContext, channelId: number, date: string): Promise<boolean> {
    const lock = await this.getPeriodLock(ctx, channelId);
    if (!lock?.lockEndDate) {
      return false;
    }

    const entryDate = new Date(date);
    const lockedUntil = new Date(lock.lockEndDate);
    return entryDate <= lockedUntil;
  }

  /**
   * Validate period is open (not locked)
   * Throws error if period is locked
   */
  async validatePeriodIsOpen(
    ctx: RequestContext,
    channelId: number,
    periodEndDate: string
  ): Promise<void> {
    const isLocked = await this.isDateLocked(ctx, channelId, periodEndDate);
    if (isLocked) {
      const lock = await this.getPeriodLock(ctx, channelId);
      throw new Error(
        `Period is locked through ${lock?.lockEndDate}. ` +
          `Cannot create entries for period ending ${periodEndDate}`
      );
    }
  }
}
