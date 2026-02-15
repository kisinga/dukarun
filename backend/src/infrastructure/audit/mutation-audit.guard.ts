import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuditService } from './audit.service';
import { AUDIT_LOG_METADATA } from './audit-log.decorator';
import { getVendureRequestContext } from './get-request-context';

/**
 * Guard that logs all mutations as a fallback when they don't have @AuditLog.
 * Ensures every mutation is audited, including built-in Vendure mutations.
 * Mutations with @AuditLog are handled by AuditLogInterceptor after execution.
 *
 * IMPORTANT: Only fires for top-level mutation resolvers (where the parent type
 * is "Mutation"), not for nested field resolvers within a mutation response.
 */
@Injectable()
export class MutationAuditGuard implements CanActivate {
  private readonly logger = new Logger(MutationAuditGuard.name);

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

    // Only audit top-level mutation fields, not nested field resolvers.
    // When GraphQL resolves a mutation response, every field resolver in the
    // result tree runs within the mutation operation context. We only want to
    // log the actual mutation (e.g. "createProductVariants"), not every scalar
    // field being resolved on the response object (e.g. "name", "price", etc.).
    // This is how Vendure's own isFieldResolver() works internally.
    const parentTypeName = info.parentType?.name;
    if (parentTypeName !== 'Mutation') {
      return true;
    }

    // Skip if already handled by @AuditLog decorator (interceptor will log on success)
    const hasDecorator = this.reflector.get(AUDIT_LOG_METADATA, context.getHandler());
    if (hasDecorator) {
      return true;
    }

    // Extract the actual Vendure RequestContext from the Express request.
    // gqlContext.getContext().req is the Express Request, NOT the RequestContext.
    // Vendure stores the RequestContext on req['vendureRequestContext'].
    const ctx = getVendureRequestContext(context);
    if (!ctx) {
      const mutationName = info.fieldName;
      this.logger.warn(
        `Cannot audit mutation.${mutationName}: RequestContext not found on request object`
      );
      return true; // Don't block the mutation
    }

    const mutationName = info.fieldName;
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
      .catch(err => {
        this.logger.debug(`Failed to log audit for mutation.${mutationName}: ${err?.message}`);
      });

    return true;
  }
}
