import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { Account } from '../../ledger/account.entity';

/**
 * Chart of Accounts Service
 *
 * Manages initialization of required accounts for channels.
 * Should be called when a new channel is created.
 *
 * IMPORTANT: This service must be called within a transaction context to ensure
 * account creation participates in the transaction (e.g., registration rollback).
 */
@Injectable()
export class ChartOfAccountsService {
  private readonly logger = new Logger(ChartOfAccountsService.name);

  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Initialize Chart of Accounts for a channel
   * Creates all required accounts if they don't exist.
   *
   * IMPORTANT: Must be called within a transaction context (RequestContext) to ensure
   * account creation participates in the transaction. This prevents orphaned accounts
   * if the transaction is rolled back (e.g., registration failure).
   *
   * Account Type Classifications:
   * - Assets: Resources owned by the business (cash, bank, receivables, clearing accounts)
   * - Liabilities: Obligations owed by the business (payables, tax obligations)
   * - Income: Revenue from business operations (sales, contra-revenue like returns)
   * - Expenses: Costs incurred in business operations (purchases, fees, general expenses)
   *
   * Note: SALES_RETURNS is classified as income (contra-revenue account) where returns
   * reduce revenue through negative balances. This follows standard accounting practice
   * for contra-revenue accounts.
   *
   * Note: CLEARING_CREDIT is a temporary clearing account for customer credit/store credit
   * transactions. It's classified as an asset because it represents funds temporarily held
   * before allocation, similar to other clearing accounts.
   */
  async initializeForChannel(
    ctx: RequestContext,
    channelId: number
  ): Promise<{ created: string[]; existing: string[] }> {
    const accountRepo = this.connection.getRepository(ctx, Account);
    const createdCodes: string[] = [];
    const existingCodes: string[] = [];

    // First, create parent accounts
    const parentAccounts = [
      { code: ACCOUNT_CODES.CASH, name: 'Cash', type: 'asset' as const, isParent: true },
    ];

    for (const account of parentAccounts) {
      const existing = await accountRepo.findOne({
        where: {
          channelId,
          code: account.code,
        },
      });

      if (!existing) {
        try {
          // Create entity instance first to ensure it's tracked in the entity manager
          const parentEntity = accountRepo.create({
            channelId,
            code: account.code,
            name: account.name,
            type: account.type,
            isActive: true,
            isParent: account.isParent,
          });
          await accountRepo.save(parentEntity);
          createdCodes.push(account.code);
          this.logger.log(
            `Created parent account ${account.code} (${account.type}) for channel ${channelId}`
          );
        } catch (error: any) {
          if (error.code === '23505' || error.message?.includes('unique constraint')) {
            this.logger.warn(
              `Parent account ${account.code} already exists for channel ${channelId}`
            );
          } else {
            throw error;
          }
        }
      } else {
        existingCodes.push(account.code);
        // Update existing account to be a parent if needed
        if (!existing.isParent) {
          await accountRepo.update(existing.id, { isParent: true });
        }
      }
    }

    // Get CASH parent account ID
    const cashParent = await accountRepo.findOne({
      where: {
        channelId,
        code: ACCOUNT_CODES.CASH,
      },
    });

    if (!cashParent) {
      throw new Error(`CASH parent account not found for channel ${channelId}`);
    }

    const requiredAccounts = [
      // Asset Accounts - Resources owned by the business
      // Cash-based payment method accounts (sub-accounts under CASH)
      {
        code: ACCOUNT_CODES.CASH_ON_HAND,
        name: 'Cash on Hand',
        type: 'asset' as const,
        parentAccountId: cashParent.id,
      },
      {
        code: ACCOUNT_CODES.BANK_MAIN,
        name: 'Bank - Main',
        type: 'asset' as const,
        parentAccountId: cashParent.id,
      },
      {
        code: ACCOUNT_CODES.CLEARING_MPESA,
        name: 'Clearing - M-Pesa',
        type: 'asset' as const,
        parentAccountId: cashParent.id,
      },
      // Standalone asset accounts (not sub-accounts)
      {
        code: ACCOUNT_CODES.CLEARING_CREDIT,
        name: 'Clearing - Customer Credit',
        type: 'asset' as const,
        parentAccountId: undefined,
      },
      {
        code: ACCOUNT_CODES.CLEARING_GENERIC,
        name: 'Clearing - Generic',
        type: 'asset' as const,
        parentAccountId: undefined,
      },
      {
        code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        name: 'Accounts Receivable',
        type: 'asset' as const,
        parentAccountId: undefined,
      },
      {
        code: ACCOUNT_CODES.INVENTORY,
        name: 'Inventory',
        type: 'asset' as const,
        parentAccountId: undefined,
      },
      // Income Accounts - Revenue from business operations
      { code: ACCOUNT_CODES.SALES, name: 'Sales Revenue', type: 'income' as const },
      {
        code: ACCOUNT_CODES.SALES_RETURNS,
        name: 'Sales Returns',
        type: 'income' as const, // Contra-revenue account (reduces revenue)
      },
      // Liability Accounts - Obligations owed by the business
      {
        code: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        name: 'Accounts Payable',
        type: 'liability' as const,
      },
      { code: ACCOUNT_CODES.TAX_PAYABLE, name: 'Taxes Payable', type: 'liability' as const },
      // Expense Accounts - Costs incurred in business operations
      { code: ACCOUNT_CODES.PURCHASES, name: 'Inventory Purchases', type: 'expense' as const },
      { code: ACCOUNT_CODES.EXPENSES, name: 'General Expenses', type: 'expense' as const },
      {
        code: ACCOUNT_CODES.PROCESSOR_FEES,
        name: 'Payment Processor Fees',
        type: 'expense' as const,
      },
      { code: ACCOUNT_CODES.CASH_SHORT_OVER, name: 'Cash Short/Over', type: 'expense' as const },
      { code: ACCOUNT_CODES.COGS, name: 'Cost of Goods Sold', type: 'expense' as const },
      {
        code: ACCOUNT_CODES.INVENTORY_WRITE_OFF,
        name: 'Inventory Write-Off',
        type: 'expense' as const,
      },
      { code: ACCOUNT_CODES.EXPIRY_LOSS, name: 'Expiry Loss', type: 'expense' as const },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const account of requiredAccounts) {
      const existing = await accountRepo.findOne({
        where: {
          channelId,
          code: account.code,
        },
      });

      if (!existing) {
        try {
          // Create entity instance first to ensure it's tracked in the entity manager
          // This ensures the entity is visible to subsequent queries in the same transaction
          const accountEntity = accountRepo.create({
            channelId,
            code: account.code,
            name: account.name,
            type: account.type,
            isActive: true,
            parentAccountId: (account as any).parentAccountId,
            isParent: false,
          });
          await accountRepo.save(accountEntity);
          createdCount++;
          createdCodes.push(account.code);
          this.logger.log(
            `Created account ${account.code} (${account.type}) for channel ${channelId}`
          );
        } catch (error: any) {
          // Handle unique constraint violations gracefully
          if (error.code === '23505' || error.message?.includes('unique constraint')) {
            this.logger.warn(
              `Account ${account.code} already exists for channel ${channelId} (race condition handled)`
            );
            existingCount++;
          } else {
            this.logger.error(
              `Failed to create account ${account.code} for channel ${channelId}: ${error.message}`,
              error.stack
            );
            throw error;
          }
        }
      } else {
        existingCount++;
        // Update parentAccountId if not set
        if ((account as any).parentAccountId && !existing.parentAccountId) {
          await accountRepo.update(existing.id, {
            parentAccountId: (account as any).parentAccountId,
          });
        }
        // Verify existing account has correct type (data integrity check)
        if (existing.type !== account.type) {
          this.logger.warn(
            `Account ${account.code} for channel ${channelId} has incorrect type: ` +
              `expected ${account.type}, found ${existing.type}. Consider manual correction.`
          );
        }
      }
    }

    this.logger.log(
      `Chart of Accounts initialized for channel ${channelId}: ` +
        `${createdCount} created, ${existingCount} already existed`
    );

    return {
      created: createdCodes,
      existing: existingCodes,
    };
  }

  /**
   * Verify all required accounts exist for a channel
   * Throws if any are missing
   *
   * IMPORTANT: Must be called within a transaction context (RequestContext) to ensure
   * queries participate in the transaction.
   */
  async verifyChannelAccounts(ctx: RequestContext, channelId: number): Promise<void> {
    const accountRepo = this.connection.getRepository(ctx, Account);
    // Use constants from single source of truth
    const requiredCodes = [
      ACCOUNT_CODES.CASH, // Parent account
      ACCOUNT_CODES.CASH_ON_HAND,
      ACCOUNT_CODES.BANK_MAIN,
      ACCOUNT_CODES.CLEARING_MPESA,
      ACCOUNT_CODES.CLEARING_CREDIT,
      ACCOUNT_CODES.CLEARING_GENERIC,
      ACCOUNT_CODES.SALES,
      ACCOUNT_CODES.SALES_RETURNS,
      ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      ACCOUNT_CODES.INVENTORY,
      ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      ACCOUNT_CODES.TAX_PAYABLE,
      ACCOUNT_CODES.PURCHASES,
      ACCOUNT_CODES.EXPENSES,
      ACCOUNT_CODES.PROCESSOR_FEES,
      ACCOUNT_CODES.CASH_SHORT_OVER,
      ACCOUNT_CODES.COGS,
      ACCOUNT_CODES.INVENTORY_WRITE_OFF,
      ACCOUNT_CODES.EXPIRY_LOSS,
    ];

    // Query accounts individually to ensure we see uncommitted changes within the transaction.
    // TypeORM's identity map should include all entities created in the current transaction,
    // but querying individually ensures we can see them even if batch queries have issues.
    const found = new Set<string>();
    const missing: string[] = [];

    for (const code of requiredCodes) {
      const account = await accountRepo.findOne({
        where: {
          channelId,
          code,
        },
      });
      if (account) {
        found.add(account.code);
      } else {
        missing.push(code);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required accounts for channel ${channelId}: ${missing.join(', ')}. ` +
          `Please run ChartOfAccountsService.initializeForChannel(ctx, ${channelId})`
      );
    }
  }

  /**
   * Account codes that cannot be used as payment source (debit account).
   * AR = customer debt; INVENTORY = stock; neither is a source of cash.
   */
  private static readonly PAYMENT_SOURCE_EXCLUDED_CODES: readonly string[] = [
    ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
    ACCOUNT_CODES.INVENTORY,
  ];

  /**
   * Returns true iff the account is a child of the CASH parent (used for payment source and eligible debit list).
   */
  async isCashChildAccount(ctx: RequestContext, account: Account): Promise<boolean> {
    if (!account.parentAccountId) {
      return false;
    }
    const accountRepo = this.connection.getRepository(ctx, Account);
    const parent = await accountRepo.findOne({
      where: {
        id: account.parentAccountId,
        channelId: ctx.channelId as number,
      },
    });
    return parent?.code === ACCOUNT_CODES.CASH;
  }

  /**
   * Validate that a debit account code is allowed as a payment source for the channel.
   * Rule: exists, active, type === asset, non-parent (leaf only), not in exclusion list, and must be a cash child account.
   *
   * @param ctx Request context (for channelId)
   * @param debitAccountCode Account code to validate
   * @throws Error if account does not exist or is not an allowed payment source
   */
  async validatePaymentSourceAccount(ctx: RequestContext, debitAccountCode: string): Promise<void> {
    if (!debitAccountCode || typeof debitAccountCode !== 'string') {
      throw new Error('debitAccountCode is required');
    }
    const code = debitAccountCode.trim();
    if (!code) {
      throw new Error('debitAccountCode is required');
    }
    const accountRepo = this.connection.getRepository(ctx, Account);
    const account = await accountRepo.findOne({
      where: {
        channelId: ctx.channelId as number,
        code,
      },
    });
    if (!account) {
      throw new Error(
        `Account ${code} does not exist for this channel. ` +
          `Initialize Chart of Accounts for this channel.`
      );
    }
    if (!account.isActive) {
      throw new Error(`Account ${code} is not active for this channel.`);
    }
    if (account.type !== 'asset') {
      throw new Error('Only asset accounts can be used as payment source.');
    }
    if (account.isParent) {
      throw new Error('Cannot use a parent (summary) account as payment source.');
    }
    if (ChartOfAccountsService.PAYMENT_SOURCE_EXCLUDED_CODES.includes(code)) {
      throw new Error(`Account ${code} is not an allowed payment source.`);
    }
    const isCashChild = await this.isCashChildAccount(ctx, account);
    if (!isCashChild) {
      throw new Error(
        'Only cash accounts (e.g. Cash on hand, Bank, M-Pesa) can be used as payment source.'
      );
    }
  }
}
