import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PeriodLock } from '../domain/period/period-lock.entity';
import { Account } from './account.entity';
import { JournalEntry } from './journal-entry.entity';
import { JournalLine } from './journal-line.entity';

export interface PostingPayload {
  channelId: number;
  entryDate: string; // YYYY-MM-DD
  memo?: string;
  /** Optional UUID of the journal entry this entry reverses (e.g. for OrderReversal). */
  reversalOf?: string | null;
  // amounts in smallest currency unit (e.g., cents)
  lines: Array<{
    accountCode: string;
    debit?: number;
    credit?: number;
    meta?: Record<string, any>;
  }>;
}

@Injectable()
export class PostingService {
  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Posts a journal entry idempotently for a given (sourceType, sourceId).
   * Throws on period lock or imbalance.
   */
  async post(
    ctx: RequestContext,
    sourceType: string,
    sourceId: string,
    payload: PostingPayload
  ): Promise<JournalEntry> {
    return this.connection.withTransaction(ctx, async txCtx => {
      const journalEntryRepo = this.connection.getRepository(txCtx, JournalEntry);
      const accountRepo = this.connection.getRepository(txCtx, Account);
      const journalLineRepo = this.connection.getRepository(txCtx, JournalLine);
      const periodLockRepo = this.connection.getRepository(txCtx, PeriodLock);

      // idempotency check
      const existing = await journalEntryRepo.findOne({
        where: { channelId: payload.channelId, sourceType, sourceId },
        relations: ['lines'],
      });
      if (existing) {
        return existing;
      }

      // Load accounts by code within channel
      const codes = Array.from(new Set(payload.lines.map(l => l.accountCode)));
      const accounts = await accountRepo
        .createQueryBuilder('a')
        .where('a.channelId = :channelId', { channelId: payload.channelId })
        .andWhere('a.code IN (:...codes)', { codes })
        .getMany();

      if (accounts.length !== codes.length) {
        const found = new Set(accounts.map(a => a.code));
        const missing = codes.filter(c => !found.has(c));
        throw new Error(`Missing accounts for codes: ${missing.join(', ')}`);
      }

      // Validate cannot post to parent accounts
      const parentAccounts = accounts.filter(a => a.isParent);
      if (parentAccounts.length > 0) {
        const parentCodes = parentAccounts.map(a => a.code);
        throw new Error(
          `Cannot post to parent accounts: ${parentCodes.join(', ')}. ` +
            `Parent accounts are computed via rollup from sub-accounts.`
        );
      }

      // Validate debits == credits
      let debitTotal = 0;
      let creditTotal = 0;
      for (const l of payload.lines) {
        debitTotal += l.debit ?? 0;
        creditTotal += l.credit ?? 0;
      }
      if (debitTotal !== creditTotal) {
        throw new Error(`Unbalanced entry: debit=${debitTotal} credit=${creditTotal}`);
      }

      // PeriodLock check
      const lock = await periodLockRepo.findOne({ where: { channelId: payload.channelId } });
      if (lock?.lockEndDate) {
        const entryDate = new Date(payload.entryDate);
        const lockedUntil = new Date(lock.lockEndDate);
        // if entryDate <= lockEndDate deny
        if (entryDate <= lockedUntil) {
          throw new Error(`Period locked through ${lock.lockEndDate}`);
        }
      }

      const entry = journalEntryRepo.create({
        channelId: payload.channelId,
        entryDate: payload.entryDate,
        memo: payload.memo,
        sourceType,
        sourceId,
        reversalOf: payload.reversalOf ?? null,
      });
      await journalEntryRepo.save(entry);

      const byCode = new Map(accounts.map(a => [a.code, a]));
      const lines = payload.lines.map(l =>
        journalLineRepo.create({
          entryId: entry.id,
          accountId: byCode.get(l.accountCode)!.id,
          channelId: payload.channelId,
          debit: String(l.debit ?? 0),
          credit: String(l.credit ?? 0),
          meta: l.meta ?? null,
        })
      );
      await journalLineRepo.save(lines);
      entry.lines = lines;
      return entry;
    });
  }
}
