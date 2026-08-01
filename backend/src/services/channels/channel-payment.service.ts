import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentMethodService,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { Account } from '../../ledger/account.entity';
import { AuditService } from '../../infrastructure/audit/audit.service';

@Injectable()
export class ChannelPaymentService {
  private readonly logger = new Logger(ChannelPaymentService.name);

  constructor(
    private readonly paymentMethodService: PaymentMethodService,
    private readonly auditService: AuditService,
    private readonly connection: TransactionalConnection
  ) {}

  async createChannelPaymentMethod(ctx: RequestContext, input: any): Promise<PaymentMethod> {
    const createInput = {
      ...input,
      enabled: true,
      customFields: {
        imageAssetId: input.imageAssetId,
        isActive: true,
      },
    };

    const paymentMethod = await this.paymentMethodService.create(ctx, createInput);

    await this.auditService
      .log(ctx, 'channel.payment_method.created', {
        entityType: 'PaymentMethod',
        entityId: paymentMethod.id.toString(),
        data: {
          name: paymentMethod.name,
          code: paymentMethod.code,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log payment method creation audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return paymentMethod;
  }

  async updateChannelPaymentMethod(ctx: RequestContext, input: any): Promise<PaymentMethod> {
    const updateInput: Record<string, any> = {
      id: input.id,
    };

    if (input.name !== undefined) {
      updateInput.name = input.name;
    }

    if (input.description !== undefined) {
      updateInput.description = input.description;
    }

    // Reconciliation custom fields (isCashierControlled, ledgerAccountCode, …) pass
    // through Vendure's customFields input; top-level isActive/imageAssetId are the
    // legacy shape kept for existing callers.
    const customFields: Record<string, any> = { ...(input.customFields ?? {}) };

    if (input.imageAssetId !== undefined) {
      customFields.imageAssetId = input.imageAssetId;
    }

    if (input.isActive !== undefined) {
      customFields.isActive = input.isActive;
    }

    if (customFields.ledgerAccountCode !== undefined && customFields.ledgerAccountCode !== null) {
      const code = String(customFields.ledgerAccountCode).trim();
      if (code === '') {
        // Empty means "auto-derive from handler/method code" — store null.
        customFields.ledgerAccountCode = null;
      } else {
        const account = await this.connection
          .getRepository(ctx, Account)
          .findOne({ where: { channelId: ctx.channelId as number, code } });
        if (!account) {
          throw new UserInputError(
            `Ledger account "${code}" does not exist for this channel. ` +
              `Use an existing account code or leave empty to auto-derive.`
          );
        }
        customFields.ledgerAccountCode = code;
      }
    }

    if (Object.keys(customFields).length > 0) {
      updateInput.customFields = customFields;
    }

    const paymentMethod = await this.paymentMethodService.update(ctx, updateInput as any);

    await this.auditService
      .log(ctx, 'channel.payment_method.updated', {
        entityType: 'PaymentMethod',
        entityId: input.id.toString(),
        data: {
          changes: {
            name: input.name,
            description: input.description,
            customFields,
          },
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log payment method update audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return paymentMethod;
  }
}
