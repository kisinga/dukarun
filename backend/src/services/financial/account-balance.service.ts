import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Account } from '../../ledger/account.entity';
import { JournalLine } from '../../ledger/journal-line.entity';
import { AccountBalance, BalanceQuery } from './ledger-query.service';

/**
 * Account Balance Service
 *
 * IMPORTANT: The ledger (journal lines) is the SINGLE SOURCE OF TRUTH for all account balances.
 * This service queries journal lines directly from the ledger - never calculates balances from other sources.
 *
 * Handles balance queries with parent account rollup support:
 * - For sub-accounts: queries journal lines directly from ledger
 * - For parent accounts: sums balances of all sub-accounts (which are calculated from ledger)
 */
@Injectable()
export class AccountBalanceService {
  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Get account balance - handles both parent and sub-accounts
   * If account is parent, returns rolled-up balance of all children
   * If account is sub-account, returns direct balance from journal lines
   */
  async getAccountBalance(
    ctx: RequestContext,
    accountCode: string,
    channelId: number,
    asOfDate?: string
  ): Promise<AccountBalance> {
    const accountRepo = this.connection.rawConnection.getRepository(Account);
    const account = await accountRepo.findOne({
      where: {
        channelId,
        code: accountCode,
      },
    });

    if (!account) {
      throw new Error(`Account ${accountCode} not found for channel ${channelId}`);
    }

    // If account is a parent, roll up balances from sub-accounts
    if (account.isParent) {
      return this.getParentAccountBalance(ctx, channelId, account.id, asOfDate);
    }

    // For sub-accounts, query journal lines directly
    return this.getSubAccountBalance(ctx, channelId, account.id, asOfDate);
  }

  /**
   * Get balance for parent account by rolling up all sub-accounts
   */
  async getParentAccountBalance(
    ctx: RequestContext,
    channelId: number,
    parentAccountId: string,
    asOfDate?: string
  ): Promise<AccountBalance> {
    const accountRepo = this.connection.rawConnection.getRepository(Account);
    const parentAccount = await accountRepo.findOne({
      where: { id: parentAccountId },
    });

    if (!parentAccount) {
      throw new Error(`Parent account ${parentAccountId} not found`);
    }

    // Get all sub-accounts
    const subAccounts = await accountRepo.find({
      where: {
        channelId,
        parentAccountId: parentAccountId,
      },
    });

    if (subAccounts.length === 0) {
      return {
        accountCode: parentAccount.code,
        accountName: parentAccount.name,
        balance: 0,
        debitTotal: 0,
        creditTotal: 0,
      };
    }

    // Sum balances of all sub-accounts (parallelized for performance)
    const subBalancePromises = subAccounts.map(subAccount =>
      this.getSubAccountBalance(ctx, channelId, subAccount.id, asOfDate)
    );
    const subBalances = await Promise.all(subBalancePromises);

    const totalBalance = subBalances.reduce((sum, balance) => sum + balance.balance, 0);
    const totalDebit = subBalances.reduce((sum, balance) => sum + balance.debitTotal, 0);
    const totalCredit = subBalances.reduce((sum, balance) => sum + balance.creditTotal, 0);

    return {
      accountCode: parentAccount.code,
      accountName: parentAccount.name,
      balance: totalBalance,
      debitTotal: totalDebit,
      creditTotal: totalCredit,
    };
  }

  /**
   * Get balance for a sub-account directly from journal lines
   */
  private async getSubAccountBalance(
    ctx: RequestContext,
    channelId: number,
    accountId: string,
    asOfDate?: string
  ): Promise<AccountBalance> {
    const journalLineRepo = this.connection.rawConnection.getRepository(JournalLine);
    const accountRepo = this.connection.rawConnection.getRepository(Account);

    const account = await accountRepo.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    let queryBuilder = journalLineRepo
      .createQueryBuilder('line')
      .innerJoin('line.entry', 'entry')
      .where('line.channelId = :channelId', { channelId })
      .andWhere('line.accountId = :accountId', { accountId });

    if (asOfDate) {
      queryBuilder = queryBuilder.andWhere('entry.entryDate <= :asOfDate', {
        asOfDate,
      });
    }

    const result = await queryBuilder
      .select('SUM(CAST(line.debit AS BIGINT))', 'debitTotal')
      .addSelect('SUM(CAST(line.credit AS BIGINT))', 'creditTotal')
      .getRawOne();

    const debitTotal = parseInt(result?.debitTotal || '0', 10);
    const creditTotal = parseInt(result?.creditTotal || '0', 10);
    const balance = debitTotal - creditTotal;

    return {
      accountCode: account.code,
      accountName: account.name,
      balance,
      debitTotal,
      creditTotal,
    };
  }

  /**
   * Get all sub-accounts for a parent account
   */
  async getSubAccounts(
    ctx: RequestContext,
    channelId: number,
    parentAccountId: string
  ): Promise<Account[]> {
    const accountRepo = this.connection.rawConnection.getRepository(Account);
    return accountRepo.find({
      where: {
        channelId,
        parentAccountId,
      },
    });
  }

  /**
   * Check if account is a parent account
   */
  async isParentAccount(
    ctx: RequestContext,
    channelId: number,
    accountCode: string
  ): Promise<boolean> {
    const accountRepo = this.connection.rawConnection.getRepository(Account);
    const account = await accountRepo.findOne({
      where: {
        channelId,
        code: accountCode,
      },
    });

    return account?.isParent ?? false;
  }
}
