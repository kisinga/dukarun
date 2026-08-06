/**
 * PeriodEndClosingService Tests
 *
 * Tests for period end closing orchestration.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PeriodEndClosingService } from '../../../src/services/financial/period-end-closing.service';
import { PeriodLockService } from '../../../src/services/financial/period-lock.service';
import { ReconciliationValidatorService } from '../../../src/services/financial/reconciliation-validator.service';
import { ReconciliationService } from '../../../src/services/financial/reconciliation.service';
import { AccountingPeriod } from '../../../src/domain/period/accounting-period.entity';

describe('PeriodEndClosingService', () => {
  const ctx = {
    channelId: 1,
    activeUserId: '1',
  } as RequestContext;

  let service: PeriodEndClosingService;
  let mockConnection: jest.Mocked<TransactionalConnection>;
  let mockPeriodLockService: jest.Mocked<PeriodLockService>;
  let mockReconciliationValidator: jest.Mocked<ReconciliationValidatorService>;
  let mockReconciliationService: jest.Mocked<ReconciliationService>;
  let mockPeriodRepo: any;

  beforeEach(() => {
    mockPeriodRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockConnection = {
      getRepository: jest.fn((ctx, entity) => {
        if (entity === AccountingPeriod) return mockPeriodRepo;
        return {};
      }),
    } as any;

    mockPeriodLockService = {
      createPeriodLock: jest.fn(),
      getPeriodLock: jest.fn(),
      isDateLocked: jest.fn(),
      validatePeriodIsOpen: jest.fn(),
    } as any;

    mockReconciliationValidator = {
      validatePeriodReconciliation: jest.fn(),
      getRequiredScopesForReconciliation: jest.fn(),
    } as any;

    mockReconciliationService = {
      getReconciliationStatus: jest.fn(),
    } as any;

    service = new PeriodEndClosingService(
      mockConnection,
      mockPeriodLockService,
      mockReconciliationValidator,
      mockReconciliationService
    );
  });

  describe('closeAccountingPeriod', () => {
    it('should successfully close period when all validations pass', async () => {
      // Use last day of month to pass validation
      const periodEndDate = '2024-01-31';

      // Mock validation passing
      mockReconciliationValidator.validatePeriodReconciliation.mockResolvedValue({
        isValid: true,
        errors: [],
        missingReconciliations: [],
      });

      // Mock no existing period
      mockPeriodRepo.findOne.mockResolvedValue(null);

      // Mock period lock creation
      const lock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: periodEndDate,
      };
      mockPeriodLockService.createPeriodLock.mockResolvedValue(lock);

      // Mock period creation
      const period: AccountingPeriod = {
        id: 'period-1',
        channelId: 1,
        startDate: '2024-01-01',
        endDate: periodEndDate,
        status: 'closed',
        closedBy: 1,
        closedAt: new Date(),
      } as AccountingPeriod;

      mockPeriodRepo.create.mockReturnValue(period);
      mockPeriodRepo.save.mockResolvedValue(period);

      // Mock reconciliation summary
      mockReconciliationService.getReconciliationStatus.mockResolvedValue({
        periodEndDate,
        scopes: [],
      });

      const result = await service.closeAccountingPeriod(ctx, 1, periodEndDate);

      expect(result.success).toBe(true);
      expect(result.period.status).toBe('closed');
      expect(mockPeriodLockService.createPeriodLock).toHaveBeenCalled();
      expect(mockPeriodRepo.save).toHaveBeenCalled();
    });

    it('should throw error if period end date is in the future', async () => {
      const periodEndDate = '2099-01-01';

      await expect(service.closeAccountingPeriod(ctx, 1, periodEndDate)).rejects.toThrow(
        'cannot be in the future'
      );
    });

    it('should throw error if reconciliations are missing', async () => {
      const periodEndDate = '2024-01-31';

      mockReconciliationValidator.validatePeriodReconciliation.mockResolvedValue({
        isValid: false,
        errors: ['Missing reconciliation for payment method: Cash on Hand'],
        missingReconciliations: [
          {
            scope: 'method',
            scopeRefId: 'CASH_ON_HAND',
            displayName: 'Cash on Hand',
          },
        ],
      });

      await expect(service.closeAccountingPeriod(ctx, 1, periodEndDate)).rejects.toThrow(
        'Cannot close period'
      );
    });

    it('should throw error if period end date is before last closed period', async () => {
      const periodEndDate = '2024-01-15';

      const lastPeriod: AccountingPeriod = {
        id: 'period-1',
        channelId: 1,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        status: 'closed',
      } as AccountingPeriod;

      mockPeriodRepo.findOne.mockResolvedValue(lastPeriod);

      await expect(service.closeAccountingPeriod(ctx, 1, periodEndDate)).rejects.toThrow(
        'must be after last closed period'
      );
    });
  });

  describe('getCurrentPeriodStatus', () => {
    it('should return period status with missing reconciliations', async () => {
      const currentPeriod: AccountingPeriod = {
        id: 'period-1',
        channelId: 1,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        status: 'open',
      } as AccountingPeriod;

      mockPeriodRepo.findOne.mockResolvedValue(currentPeriod);
      mockPeriodLockService.getPeriodLock.mockResolvedValue(null);

      mockReconciliationValidator.validatePeriodReconciliation.mockResolvedValue({
        isValid: false,
        errors: [],
        missingReconciliations: [
          {
            scope: 'method',
            scopeRefId: 'CASH_ON_HAND',
          },
        ],
      });

      const result = await service.getCurrentPeriodStatus(ctx, 1);

      expect(result.currentPeriod).toEqual(currentPeriod);
      expect(result.isLocked).toBe(false);
      expect(result.canClose).toBe(false);
      expect(result.missingReconciliations).toContain('method');
    });

    it('should return locked status when period is locked', async () => {
      const lock = {
        id: 'lock-1',
        channelId: 1,
        lockEndDate: '2024-01-31',
      };

      mockPeriodRepo.findOne.mockResolvedValue(null);
      mockPeriodLockService.getPeriodLock.mockResolvedValue(lock);

      const result = await service.getCurrentPeriodStatus(ctx, 1);

      expect(result.isLocked).toBe(true);
      expect(result.lockEndDate).toBe('2024-01-31');
    });
  });
});
