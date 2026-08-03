/**
 * PeriodLockService Tests
 *
 * Tests for period lock management.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PeriodLockService } from '../../../src/services/financial/period-lock.service';
import { PeriodLock } from '../../../src/domain/period/period-lock.entity';

describe('PeriodLockService', () => {
  const ctx = {
    channelId: 1,
    activeUserId: 1,
  } as RequestContext;

  let service: PeriodLockService;
  let mockConnection: jest.Mocked<TransactionalConnection>;
  let mockPeriodLockRepo: any;

  beforeEach(() => {
    mockPeriodLockRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockConnection = {
      getRepository: jest.fn((ctx, entity) => {
        if (entity === PeriodLock) return mockPeriodLockRepo;
        return {};
      }),
    } as any;

    service = new PeriodLockService(mockConnection);
  });

  describe('createPeriodLock', () => {
    it('should create new period lock when none exists', async () => {
      mockPeriodLockRepo.findOne.mockResolvedValue(null);

      const newLock: PeriodLock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-31',
        lockedByUserId: 1,
        lockedAt: new Date(),
      } as PeriodLock;

      mockPeriodLockRepo.create.mockReturnValue(newLock);
      mockPeriodLockRepo.save.mockResolvedValue(newLock);

      const result = await service.createPeriodLock(ctx, 1, '2024-01-31', 1);

      expect(result).toEqual(newLock);
      expect(mockPeriodLockRepo.create).toHaveBeenCalled();
      expect(mockPeriodLockRepo.save).toHaveBeenCalled();
    });

    it('should update existing period lock', async () => {
      const existingLock: PeriodLock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-15',
        lockedByUserId: 1,
        lockedAt: new Date('2024-01-15'),
      } as PeriodLock;

      mockPeriodLockRepo.findOne.mockResolvedValue(existingLock);
      mockPeriodLockRepo.save.mockResolvedValue({
        ...existingLock,
        lockEndDate: '2024-01-31',
        lockedAt: new Date(),
      });

      const result = await service.createPeriodLock(ctx, 1, '2024-01-31', 1);

      expect(result.lockEndDate).toBe('2024-01-31');
      expect(mockPeriodLockRepo.save).toHaveBeenCalled();
    });
  });

  describe('getPeriodLock', () => {
    it('should return period lock if exists', async () => {
      const lock: PeriodLock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-31',
      } as PeriodLock;

      mockPeriodLockRepo.findOne.mockResolvedValue(lock);

      const result = await service.getPeriodLock(ctx, 1);

      expect(result).toEqual(lock);
      expect(mockPeriodLockRepo.findOne).toHaveBeenCalledWith({
        where: { channelId: 1 },
      });
    });

    it('should return null if no lock exists', async () => {
      mockPeriodLockRepo.findOne.mockResolvedValue(null);

      const result = await service.getPeriodLock(ctx, 1);

      expect(result).toBeNull();
    });
  });

  describe('isDateLocked', () => {
    it('should return true if date is locked', async () => {
      const lock: PeriodLock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-31',
      } as PeriodLock;

      mockPeriodLockRepo.findOne.mockResolvedValue(lock);

      const result = await service.isDateLocked(ctx, 1, '2024-01-15');

      expect(result).toBe(true);
    });

    it('should return false if date is after lock', async () => {
      const lock: PeriodLock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-31',
      } as PeriodLock;

      mockPeriodLockRepo.findOne.mockResolvedValue(lock);

      const result = await service.isDateLocked(ctx, 1, '2024-02-01');

      expect(result).toBe(false);
    });

    it('should return false if no lock exists', async () => {
      mockPeriodLockRepo.findOne.mockResolvedValue(null);

      const result = await service.isDateLocked(ctx, 1, '2024-01-15');

      expect(result).toBe(false);
    });
  });

  describe('validatePeriodIsOpen', () => {
    it('should throw error if period is locked', async () => {
      const lock: PeriodLock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-31',
      } as PeriodLock;

      mockPeriodLockRepo.findOne.mockResolvedValue(lock);

      await expect(service.validatePeriodIsOpen(ctx, 1, '2024-01-15')).rejects.toThrow(
        'Period is locked'
      );
    });

    it('should not throw if period is open', async () => {
      mockPeriodLockRepo.findOne.mockResolvedValue(null);

      await expect(service.validatePeriodIsOpen(ctx, 1, '2024-02-01')).resolves.not.toThrow();
    });
  });
});
