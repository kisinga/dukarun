import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { RequestContext } from '@vendure/core';
import { AuditService } from './audit.service';
import { AUDIT_LOG_METADATA } from './audit-log.decorator';

/**
 * Guard that logs all mutations as a fallback when they don't have @AuditLog.
 * Ensures every mutation is audited, including built-in Vendure mutations.
 * Mutations with @AuditLog are handled by AuditLogInterceptor after execution.
 */
@Injectable()
export class MutationAuditGuard implements CanActivate {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only process GraphQL operations
    if (context.getType<string>() !== 'graphql') {
      return true;
    }

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();

    if (info.operation?.operation !== 'mutation') {
      return true;
    }

    // Skip if already handled by @AuditLog decorator (interceptor will log on success)
    const hasDecorator = this.reflector.get(AUDIT_LOG_METADATA, context.getHandler());
    if (hasDecorator) {
      return true;
    }

    const mutationName = info.fieldName;
    const ctx = gqlContext.getContext().req as RequestContext;
    const args = gqlContext.getArgs() as Record<string, unknown> | undefined;
    const channelIdFromArgs =
      (args?.input as Record<string, unknown> | undefined)?.channelId ?? args?.channelId;

    // Log generic mutation event (attempted)
    await this.auditService
      .log(ctx, `mutation.${mutationName}`, {
        data: { mutationName },
        ...(channelIdFromArgs != null && channelIdFromArgs !== ''
          ? { channelId: channelIdFromArgs as number | string }
          : {}),
      })
      .catch(() => {});

    return true;
  }
}
