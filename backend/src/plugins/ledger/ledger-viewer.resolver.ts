import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { In, Not } from 'typeorm';
import { DataSource } from 'typeorm';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { Account } from '../../ledger/account.entity';
import { JournalEntry } from '../../ledger/journal-entry.entity';
import { JournalLine } from '../../ledger/journal-line.entity';
import { LedgerQueryService } from '../../services/financial/ledger-query.service';

interface JournalEntriesOptions {
  accountCode?: string;
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  take?: number;
  skip?: number;
}

@Resolver()
export class LedgerViewerResolver {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledgerQueryService: LedgerQueryService
  ) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async ledgerAccounts(@Ctx() ctx: RequestContext) {
    const channelId = ctx.channelId as number;
    const accountRepo = this.dataSource.getRepository(Account);

    const accounts = await accountRepo.find({
      where: { channelId, isActive: true },
      order: { code: 'ASC' },
    });

    // Get balances for each account
    const accountsWithBalances = await Promise.all(
      accounts.map(async account => {
        const balance = await this.ledgerQueryService.getAccountBalance({
          channelId,
          accountCode: account.code,
        });
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          isActive: account.isActive,
          balance: balance.balance, // In smallest currency unit (cents)
          parentAccountId: account.parentAccountId || null,
          isParent: account.isParent,
        };
      })
    );

    return {
      items: accountsWithBalances,
    };
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async paymentSourceAccounts(@Ctx() ctx: RequestContext) {
    const channelId = ctx.channelId as number;
    const accountRepo = this.dataSource.getRepository(Account);

    const accounts = await accountRepo.find({
      where: {
        channelId,
        isActive: true,
        type: 'asset',
        isParent: false,
        code: Not(In([ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, ACCOUNT_CODES.INVENTORY])),
      },
      order: { code: 'ASC' },
    });

    const accountsWithBalances = await Promise.all(
      accounts.map(async account => {
        const balance = await this.ledgerQueryService.getAccountBalance({
          channelId,
          accountCode: account.code,
        });
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          isActive: account.isActive,
          balance: balance.balance,
          parentAccountId: account.parentAccountId || null,
          isParent: account.isParent,
        };
      })
    );

    return {
      items: accountsWithBalances,
    };
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async journalEntries(
    @Ctx() ctx: RequestContext,
    @Args('options', { nullable: true }) options?: JournalEntriesOptions
  ) {
    const channelId = ctx.channelId as number;
    const entryRepo = this.dataSource.getRepository(JournalEntry);
    const lineRepo = this.dataSource.getRepository(JournalLine);

    let queryBuilder = entryRepo
      .createQueryBuilder('entry')
      .where('entry.channelId = :channelId', { channelId })
      .orderBy('entry.postedAt', 'DESC')
      .addOrderBy('entry.entryDate', 'DESC');

    // Apply filters
    if (options?.startDate) {
      queryBuilder = queryBuilder.andWhere('entry.entryDate >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      queryBuilder = queryBuilder.andWhere('entry.entryDate <= :endDate', {
        endDate: options.endDate,
      });
    }

    if (options?.sourceType) {
      queryBuilder = queryBuilder.andWhere('entry.sourceType = :sourceType', {
        sourceType: options.sourceType,
      });
    }

    // Get total count before pagination
    const totalItems = await queryBuilder.getCount();

    // Apply pagination
    if (options?.skip) {
      queryBuilder = queryBuilder.skip(options.skip);
    }
    if (options?.take) {
      queryBuilder = queryBuilder.take(options.take || 50);
    } else {
      queryBuilder = queryBuilder.take(50); // Default limit
    }

    const entries = await queryBuilder.getMany();

    // Load lines for each entry with account info
    const entriesWithLines = await Promise.all(
      entries.map(async entry => {
        let lineQuery = lineRepo
          .createQueryBuilder('line')
          .innerJoinAndSelect('line.account', 'account')
          .where('line.entryId = :entryId', { entryId: entry.id });

        // Filter by account code if provided
        if (options?.accountCode) {
          lineQuery = lineQuery.andWhere('account.code = :accountCode', {
            accountCode: options.accountCode,
          });
        }

        const lines = await lineQuery.getMany();

        return {
          id: entry.id,
          entryDate: entry.entryDate,
          postedAt: entry.postedAt,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          memo: entry.memo,
          lines: lines.map(line => ({
            id: line.id,
            accountCode: line.account.code,
            accountName: line.account.name,
            debit: parseInt(line.debit, 10), // In smallest currency unit (cents)
            credit: parseInt(line.credit, 10), // In smallest currency unit (cents)
            meta: line.meta,
          })),
        };
      })
    );

    return {
      items: entriesWithLines,
      totalItems,
    };
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async journalEntry(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    const channelId = ctx.channelId as number;
    const entryRepo = this.dataSource.getRepository(JournalEntry);
    const lineRepo = this.dataSource.getRepository(JournalLine);

    const entry = await entryRepo.findOne({
      where: { id, channelId },
    });

    if (!entry) {
      return null;
    }

    const lines = await lineRepo
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.account', 'account')
      .where('line.entryId = :entryId', { entryId: entry.id })
      .getMany();

    return {
      id: entry.id,
      entryDate: entry.entryDate,
      postedAt: entry.postedAt,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      memo: entry.memo,
      lines: lines.map(line => ({
        id: line.id,
        accountCode: line.account.code,
        accountName: line.account.name,
        debit: parseInt(line.debit, 10), // In smallest currency unit (cents)
        credit: parseInt(line.credit, 10), // In smallest currency unit (cents)
        meta: line.meta,
      })),
    };
  }
}
