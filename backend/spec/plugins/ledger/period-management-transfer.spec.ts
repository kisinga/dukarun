/**
 * Inter-account transfer (createInterAccountTransfer) tests
 *
 * Covers input validation, account validation, period lock, idempotency, and fee lines.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { PeriodManagementResolver } from '../../../src/plugins/ledger/period-management.resolver';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';

describe('PeriodManagementResolver.createInterAccountTransfer', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
  let resolver: PeriodManagementResolver;
  let mockPeriodLockService: any;
  let mockChartOfAccountsService: any;
  let mockPostingService: any;

  const validInput = {
    channelId: 1,
    transferId: 'transfer-123',
    fromAccountCode: ACCOUNT_CODES.CASH_ON_HAND,
    toAccountCode: ACCOUNT_CODES.BANK_MAIN,
    amount: '10000',
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'Test transfer',
  };

  beforeEach(() => {
    mockPeriodLockService = {
      validatePeriodIsOpen: jest.fn().mockImplementation(() => Promise.resolve()),
    } as any;
    mockChartOfAccountsService = {
      validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
    } as any;
    const mockJournalEntry = {
      id: 'je-1',
      channelId: 1,
      sourceType: 'inter-account-transfer',
      sourceId: validInput.transferId,
      entryDate: validInput.entryDate,
      memo: validInput.memo,
      lines: [],
    };
    mockPostingService = {
      post: jest.fn().mockImplementation(() => Promise.resolve(mockJournalEntry)),
    } as any;
    resolver = new PeriodManagementResolver(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      mockPostingService,
      {} as any,
      mockPeriodLockService,
      {} as any,
      mockChartOfAccountsService
    );
  });

  it('should throw when transferId is missing or empty', async () => {
    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, transferId: '' })
    ).rejects.toThrow(/transferId is required/);

    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, transferId: '   ' })
    ).rejects.toThrow(/transferId is required/);

    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, transferId: undefined as any })
    ).rejects.toThrow(/transferId is required/);

    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('should throw when amount is zero or negative', async () => {
    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, amount: '0' })
    ).rejects.toThrow(/Transfer amount must be greater than zero/);

    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, amount: '-100' })
    ).rejects.toThrow(/Transfer amount must be greater than zero/);

    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('should throw when feeAmount is negative', async () => {
    await expect(
      resolver.createInterAccountTransfer(ctx, {
        ...validInput,
        feeAmount: '-50',
      })
    ).rejects.toThrow(/Transfer fee amount cannot be negative/);

    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('should call validatePaymentSourceAccount for both from and to accounts', async () => {
    await resolver.createInterAccountTransfer(ctx, validInput);

    expect(mockChartOfAccountsService.validatePaymentSourceAccount).toHaveBeenCalledWith(
      ctx,
      validInput.fromAccountCode
    );
    expect(mockChartOfAccountsService.validatePaymentSourceAccount).toHaveBeenCalledWith(
      ctx,
      validInput.toAccountCode
    );
  });

  it('should throw when fromAccountCode is invalid', async () => {
    mockChartOfAccountsService.validatePaymentSourceAccount.mockRejectedValueOnce(
      new Error('Account INVALID is not an allowed payment source.')
    );

    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, fromAccountCode: 'INVALID' })
    ).rejects.toThrow(/not an allowed payment source/);

    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('should throw when toAccountCode is invalid', async () => {
    mockChartOfAccountsService.validatePaymentSourceAccount
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Account INVALID is not an allowed payment source.'));

    await expect(
      resolver.createInterAccountTransfer(ctx, { ...validInput, toAccountCode: 'INVALID' })
    ).rejects.toThrow(/not an allowed payment source/);

    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('should throw when period is locked', async () => {
    mockPeriodLockService.validatePeriodIsOpen.mockRejectedValue(
      new Error('Period locked through 2025-01-31')
    );

    await expect(resolver.createInterAccountTransfer(ctx, validInput)).rejects.toThrow(
      /Period locked/
    );

    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('should call post with sourceType and sourceId for idempotency', async () => {
    await resolver.createInterAccountTransfer(ctx, validInput);

    expect(mockPostingService.post).toHaveBeenCalledWith(
      ctx,
      'inter-account-transfer',
      validInput.transferId.trim(),
      expect.objectContaining({
        channelId: validInput.channelId,
        entryDate: validInput.entryDate,
        memo: validInput.memo,
        lines: [
          { accountCode: validInput.fromAccountCode, debit: 0, credit: 10000 },
          { accountCode: validInput.toAccountCode, debit: 10000, credit: 0 },
        ],
      })
    );
  });

  it('should build two lines when no fee', async () => {
    await resolver.createInterAccountTransfer(ctx, validInput);

    const payload = mockPostingService.post.mock.calls[0][3];
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines[0]).toEqual({
      accountCode: ACCOUNT_CODES.CASH_ON_HAND,
      debit: 0,
      credit: 10000,
    });
    expect(payload.lines[1]).toEqual({
      accountCode: ACCOUNT_CODES.BANK_MAIN,
      debit: 10000,
      credit: 0,
    });
  });

  it('should build three lines when feeAmount > 0 (from credit principal+fee, to debit principal, PROCESSOR_FEES debit fee)', async () => {
    await resolver.createInterAccountTransfer(ctx, {
      ...validInput,
      amount: '10000',
      feeAmount: '100',
      expenseTag: 'bank_fee',
    });

    const payload = mockPostingService.post.mock.calls[0][3];
    expect(payload.lines).toHaveLength(3);
    expect(payload.lines[0]).toEqual({
      accountCode: ACCOUNT_CODES.CASH_ON_HAND,
      debit: 0,
      credit: 10100,
    });
    expect(payload.lines[1]).toEqual({
      accountCode: ACCOUNT_CODES.BANK_MAIN,
      debit: 10000,
      credit: 0,
    });
    expect(payload.lines[2]).toEqual({
      accountCode: ACCOUNT_CODES.PROCESSOR_FEES,
      debit: 100,
      credit: 0,
      meta: { expenseTag: 'bank_fee' },
    });
  });

  it('should return same journal entry on second call with same transferId (idempotency)', async () => {
    const entry = {
      id: 'je-idempotent',
      channelId: 1,
      sourceType: 'inter-account-transfer',
      sourceId: validInput.transferId,
      entryDate: validInput.entryDate,
      memo: validInput.memo,
      lines: [],
    };
    mockPostingService.post.mockImplementation(() => Promise.resolve(entry));

    const first = await resolver.createInterAccountTransfer(ctx, validInput);
    const second = await resolver.createInterAccountTransfer(ctx, validInput);

    expect(first.id).toBe(entry.id);
    expect(second.id).toBe(entry.id);
    expect(mockPostingService.post).toHaveBeenCalledTimes(2);
  });
});
