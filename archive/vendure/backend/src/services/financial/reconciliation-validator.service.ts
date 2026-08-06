import { Injectable } from '@nestjs/common';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';
import { CashierSession } from '../../domain/cashier/cashier-session.entity';
import { CashDrawerCount } from '../../domain/cashier/cash-drawer-count.entity';
import { MpesaVerification } from '../../domain/cashier/mpesa-verification.entity';
import { Reconciliation, ReconciliationScope } from '../../domain/recon/reconciliation.entity';
import { Account } from '../../ledger/account.entity';
import {
  getAccountCodeFromPaymentMethod,
  getReconciliationTypeFromPaymentMethod,
  isCashierControlledPaymentMethod,
  requiresReconciliation,
} from './payment-method-mapping.config';
import {
  MissingReconciliation,
  PaymentMethodReconciliationConfig,
  toScopeRefId,
  type ReconciliationScopeRef,
  ValidationResult,
} from './period-management.types';
import { ChannelPaymentMethodService } from './channel-payment-method.service';

/**
 * Reconciliation Validator Service
 *
 * Validates reconciliation completeness across all required scopes.
 */
@Injectable()
export class ReconciliationValidatorService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly channelPaymentMethodService: ChannelPaymentMethodService
  ) {}

  /**
   * Validate all required scopes are reconciled for a period
   */
  async validatePeriodReconciliation(
    ctx: RequestContext,
    channelId: number,
    periodEndDate: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const missingReconciliations: MissingReconciliation[] = [];

    // Get required payment method accounts
    const paymentMethodAccounts = await this.getRequiredPaymentMethodAccounts(ctx, channelId);

    // Check each payment method account has verified reconciliation
    for (const account of paymentMethodAccounts) {
      const ref: ReconciliationScopeRef = { scope: 'method', methodCode: account.code };
      const reconciliation = await this.findReconciliation(ctx, channelId, ref, periodEndDate);

      if (!reconciliation) {
        missingReconciliations.push({
          scope: 'method',
          scopeRefId: toScopeRefId(ref),
          displayName: account.name,
        });
        errors.push(`Missing reconciliation for payment method: ${account.name} (${account.code})`);
      } else if (reconciliation.status !== 'verified') {
        errors.push(
          `Reconciliation for payment method ${account.name} (${account.code}) is not verified`
        );
      }
    }

    // Check cash-session reconciliation (if cashier flow enabled)
    const cashierSessionValidation = await this.validateCashierSessionReconciliations(
      ctx,
      channelId,
      periodEndDate
    );
    if (!cashierSessionValidation.isValid) {
      errors.push(...cashierSessionValidation.errors);
      missingReconciliations.push(...cashierSessionValidation.missingReconciliations);
    }

    // TODO: Check inventory reconciliation (if required)
    // TODO: Check bank reconciliation (if required and configured)

    return {
      isValid: errors.length === 0,
      errors,
      missingReconciliations,
    };
  }

  /**
   * Get required scopes for reconciliation
   */
  async getRequiredScopesForReconciliation(
    ctx: RequestContext,
    channelId: number
  ): Promise<ReconciliationScope[]> {
    const scopes: ReconciliationScope[] = ['method']; // Always required

    // Check if any payment method has cashier-controlled reconciliation
    const reconConfigs = await this.getRequiredReconciliations(ctx, channelId);
    const hasCashierControlled = reconConfigs.some(config => config.isCashierControlled);

    if (hasCashierControlled) {
      scopes.push('cash-session');
    }

    // TODO: Add inventory, bank based on configuration

    return scopes;
  }

  /**
   * Get all payment methods requiring reconciliation with their config
   * Driven by PaymentMethod custom fields
   */
  async getRequiredReconciliations(
    ctx: RequestContext,
    channelId: number
  ): Promise<PaymentMethodReconciliationConfig[]> {
    const paymentMethods = await this.channelPaymentMethodService.getChannelPaymentMethods(
      ctx,
      channelId
    );

    return paymentMethods
      .filter(pm => pm.enabled && requiresReconciliation(pm))
      .map(pm => ({
        paymentMethodId: pm.id.toString(),
        paymentMethodCode: pm.code,
        paymentMethodName: this.channelPaymentMethodService.getPaymentMethodDisplayName(pm),
        reconciliationType: getReconciliationTypeFromPaymentMethod(pm),
        ledgerAccountCode: getAccountCodeFromPaymentMethod(pm),
        isCashierControlled: isCashierControlledPaymentMethod(pm),
        requiresReconciliation: requiresReconciliation(pm),
      }));
  }

  /**
   * Get channel reconciliation config for all payment methods
   * Used by GraphQL to expose config to frontend
   */
  async getChannelReconciliationConfig(
    ctx: RequestContext,
    channelId: number
  ): Promise<PaymentMethodReconciliationConfig[]> {
    const paymentMethods = await this.channelPaymentMethodService.getChannelPaymentMethods(
      ctx,
      channelId
    );

    return paymentMethods
      .filter(pm => pm.enabled)
      .map(pm => ({
        paymentMethodId: pm.id.toString(),
        paymentMethodCode: pm.code,
        paymentMethodName: this.channelPaymentMethodService.getPaymentMethodDisplayName(pm),
        reconciliationType: getReconciliationTypeFromPaymentMethod(pm),
        ledgerAccountCode: getAccountCodeFromPaymentMethod(pm),
        isCashierControlled: isCashierControlledPaymentMethod(pm),
        requiresReconciliation: requiresReconciliation(pm),
      }));
  }

  /**
   * Validate reconciliation for a specific payment method based on its type
   */
  async validateReconciliationForPaymentMethod(
    ctx: RequestContext,
    paymentMethod: PaymentMethod,
    sessionId?: string
  ): Promise<ValidationResult> {
    const reconType = getReconciliationTypeFromPaymentMethod(paymentMethod);

    switch (reconType) {
      case 'blind_count':
        return this.validateBlindCountReconciliation(ctx, sessionId, paymentMethod);
      case 'transaction_verification':
        return this.validateTransactionVerification(ctx, sessionId, paymentMethod);
      case 'statement_match':
        return this.validateStatementMatch(ctx, paymentMethod);
      default:
        return { isValid: true, errors: [], missingReconciliations: [] };
    }
  }

  /**
   * Validate blind count reconciliation (for cash)
   * Checks that a closing count exists for the session
   */
  private async validateBlindCountReconciliation(
    ctx: RequestContext,
    sessionId: string | undefined,
    paymentMethod: PaymentMethod
  ): Promise<ValidationResult> {
    if (!sessionId) {
      return {
        isValid: false,
        errors: [`Blind count validation requires a session ID for ${paymentMethod.code}`],
        missingReconciliations: [],
      };
    }

    const countRepo = this.connection.getRepository(ctx, CashDrawerCount);
    const closingCount = await countRepo.findOne({
      where: {
        sessionId: sessionId,
        countType: 'closing',
      },
    });

    if (!closingCount) {
      return {
        isValid: false,
        errors: [`Missing closing cash count for session ${sessionId}`],
        missingReconciliations: [
          {
            scope: 'cash-session',
            scopeRefId: toScopeRefId({ scope: 'cash-session', sessionId }),
            displayName: `Closing count for ${paymentMethod.code}`,
          },
        ],
      };
    }

    return { isValid: true, errors: [], missingReconciliations: [] };
  }

  /**
   * Validate transaction verification (for M-Pesa)
   * Checks that verification exists for the session
   */
  private async validateTransactionVerification(
    ctx: RequestContext,
    sessionId: string | undefined,
    paymentMethod: PaymentMethod
  ): Promise<ValidationResult> {
    if (!sessionId) {
      return {
        isValid: false,
        errors: [`Transaction verification requires a session ID for ${paymentMethod.code}`],
        missingReconciliations: [],
      };
    }

    const verificationRepo = this.connection.getRepository(ctx, MpesaVerification);
    const verification = await verificationRepo.findOne({
      where: { sessionId: sessionId },
    });

    if (!verification) {
      return {
        isValid: false,
        errors: [`Missing M-Pesa verification for session ${sessionId}`],
        missingReconciliations: [
          {
            scope: 'cash-session',
            scopeRefId: toScopeRefId({ scope: 'cash-session', sessionId }),
            displayName: `M-Pesa verification for ${paymentMethod.code}`,
          },
        ],
      };
    }

    return { isValid: true, errors: [], missingReconciliations: [] };
  }

  /**
   * Validate statement match (for bank transfers)
   * Placeholder for future implementation
   */
  private async validateStatementMatch(
    _ctx: RequestContext,
    _paymentMethod: PaymentMethod
  ): Promise<ValidationResult> {
    // TODO: Implement bank statement matching validation
    return { isValid: true, errors: [], missingReconciliations: [] };
  }

  /**
   * Validate cashier session reconciliations for a period
   * Only validates if cash control is enabled for the channel
   */
  private async validateCashierSessionReconciliations(
    ctx: RequestContext,
    channelId: number,
    periodEndDate: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const missingReconciliations: MissingReconciliation[] = [];

    // Check if cash control is enabled
    const isCashControlEnabled = await this.isCashControlEnabled(ctx, channelId);
    if (!isCashControlEnabled) {
      return { isValid: true, errors: [], missingReconciliations: [] };
    }

    // Get closed sessions for the period that need reconciliation
    const sessionsNeedingReconciliation = await this.getClosedSessionsForPeriod(
      ctx,
      channelId,
      periodEndDate
    );

    // Check each session has a verified reconciliation
    for (const session of sessionsNeedingReconciliation) {
      const ref: ReconciliationScopeRef = { scope: 'cash-session', sessionId: session.id };
      const reconciliation = await this.findReconciliation(ctx, channelId, ref, periodEndDate);

      if (!reconciliation) {
        const displayName = `Session ${session.openedAt.toISOString().slice(0, 10)} (User ${session.cashierUserId})`;
        missingReconciliations.push({
          scope: 'cash-session',
          scopeRefId: toScopeRefId(ref),
          displayName,
        });
        errors.push(`Missing reconciliation for cashier session: ${displayName}`);
      } else if (reconciliation.status !== 'verified') {
        errors.push(`Reconciliation for cashier session ${session.id} is not verified`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      missingReconciliations,
    };
  }

  /**
   * Check if cash control is enabled for a channel
   * Determined by channel-level cashControlEnabled setting
   */
  private async isCashControlEnabled(ctx: RequestContext, channelId: number): Promise<boolean> {
    const channelRepo = this.connection.getRepository(ctx, Channel);
    const channel = await channelRepo.findOne({
      where: { id: channelId },
    });

    if (!channel) {
      return false;
    }

    // Check channel customFields.cashControlEnabled
    const channelCashControl = (channel as any).customFields?.cashControlEnabled;
    return channelCashControl === true;
  }

  /**
   * Get closed cashier sessions for a period that need reconciliation
   */
  private async getClosedSessionsForPeriod(
    ctx: RequestContext,
    channelId: number,
    periodEndDate: string
  ): Promise<CashierSession[]> {
    const sessionRepo = this.connection.getRepository(ctx, CashierSession);

    // Find sessions that were closed on or before the period end date
    // and opened after the last closed period
    return sessionRepo
      .createQueryBuilder('session')
      .where('session.channelId = :channelId', { channelId })
      .andWhere('session.status = :status', { status: 'closed' })
      .andWhere('DATE(session.closedAt) <= :periodEndDate', { periodEndDate })
      .getMany();
  }

  /**
   * Get required payment method accounts that need reconciliation
   * Now driven by PaymentMethod custom fields (requiresReconciliation)
   * Returns sub-accounts (accounts with parentAccountId set)
   */
  async getRequiredPaymentMethodAccounts(
    ctx: RequestContext,
    channelId: number
  ): Promise<Account[]> {
    const accountRepo = this.connection.getRepository(ctx, Account);

    // Get reconciliation configs from payment methods
    const reconConfigs = await this.getRequiredReconciliations(ctx, channelId);

    if (reconConfigs.length === 0) {
      return [];
    }

    // Get unique account codes from payment methods that require reconciliation
    const accountCodes = new Set<string>();
    for (const config of reconConfigs) {
      accountCodes.add(config.ledgerAccountCode);
    }

    // Get accounts that are sub-accounts (have parentAccountId set)
    const accounts = await accountRepo
      .createQueryBuilder('account')
      .where('account.channelId = :channelId', { channelId })
      .andWhere('account.code IN (:...codes)', { codes: Array.from(accountCodes) })
      .andWhere('account.parentAccountId IS NOT NULL')
      .getMany();

    return accounts;
  }

  /**
   * Find reconciliation for a scope and ref (type-safe).
   */
  private async findReconciliation(
    ctx: RequestContext,
    channelId: number,
    ref: ReconciliationScopeRef,
    periodEndDate: string
  ): Promise<Reconciliation | null> {
    const reconciliationRepo = this.connection.getRepository(ctx, Reconciliation);
    const scopeRefId = toScopeRefId(ref);

    return reconciliationRepo
      .createQueryBuilder('reconciliation')
      .where('reconciliation.channelId = :channelId', { channelId })
      .andWhere('reconciliation.scope = :scope', { scope: ref.scope })
      .andWhere('reconciliation.scopeRefId = :scopeRefId', { scopeRefId })
      .andWhere('reconciliation.snapshotAt = :periodEndDate', { periodEndDate })
      .getOne();
  }
}
