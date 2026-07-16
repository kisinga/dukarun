import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { CreditNotificationCheckpointService } from '../../../src/services/credit/credit-notification-checkpoint.service';
import { CreditNotificationCheckpoint } from '../../../src/services/credit/credit-notification-checkpoint.entity';

interface MockRepo {
  count: jest.MockedFunction<any>;
  save: jest.MockedFunction<any>;
  delete: jest.MockedFunction<any>;
}

function buildMockRepository(): MockRepo {
  return {
    count: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
}

function buildService(repo: MockRepo) {
  const connection = {
    getRepository: jest.fn().mockImplementation((_ctx: any, entity: any) => {
      if (entity === CreditNotificationCheckpoint) {
        return repo;
      }
      return {};
    }),
  };
  return new CreditNotificationCheckpointService(connection as any);
}

describe('CreditNotificationCheckpointService', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let repo: MockRepo;
  let service: CreditNotificationCheckpointService;

  beforeEach(() => {
    repo = buildMockRepository();
    service = buildService(repo);
  });

  it('returns true when a checkpoint exists', async () => {
    repo.count.mockResolvedValue(1);

    const result = await service.hasCheckpoint(ctx, 'credit_reminder', 'cust-1', 'period_3_days');

    expect(result).toBe(true);
    expect(repo.count).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', triggerKey: 'credit_reminder', bucket: 'period_3_days' },
    });
  });

  it('creates a checkpoint with the current timestamp', async () => {
    await service.createCheckpoint(ctx, 'credit_reminder', 'cust-1', 'limit_near');

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        triggerKey: 'credit_reminder',
        bucket: 'limit_near',
        sentAt: expect.any(Date),
      })
    );
  });

  it('clears all checkpoints for a party', async () => {
    await service.clearCheckpoints(ctx, 'credit_reminder', 'cust-1');

    expect(repo.delete).toHaveBeenCalledWith({
      customerId: 'cust-1',
      triggerKey: 'credit_reminder',
    });
  });

  it('clears checkpoints older than the TTL', async () => {
    await service.clearOldCheckpoints(ctx, 'credit_reminder', 90);

    const deleteCall = repo.delete.mock.calls[0][0] as any;
    expect(deleteCall).toMatchObject({
      triggerKey: 'credit_reminder',
    });
    expect(deleteCall.sentAt).toBeDefined();
    expect(deleteCall.sentAt.value).toBeInstanceOf(Date);

    const cutoff = deleteCall.sentAt.value as Date;
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(90);
  });
});
