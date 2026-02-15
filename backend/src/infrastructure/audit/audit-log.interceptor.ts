import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_LOG_METADATA, AuditLogMetadata } from './audit-log.decorator';
import { getVendureRequestContext } from './get-request-context';

/**
 * Interceptor that automatically logs audit events for mutations decorated with @AuditLog.
 * Runs after successful mutation execution and captures result/args for audit data.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Only process GraphQL operations
    if (context.getType<string>() !== 'graphql') {
      return next.handle();
    }

    const metadata = this.reflector.get<AuditLogMetadata>(AUDIT_LOG_METADATA, context.getHandler());

    if (!metadata) {
      return next.handle();
    }

    // Extract the actual Vendure RequestContext from the Express request.
    // gqlContext.getContext().req is the Express Request, NOT the RequestContext.
    const ctx = getVendureRequestContext(context);
    if (!ctx) {
      this.logger.warn(
        `Cannot audit ${metadata.eventType}: RequestContext not found on request object`
      );
      return next.handle();
    }

    const gqlContext = GqlExecutionContext.create(context);
    const args = gqlContext.getArgs();

    return next.handle().pipe(
      tap(async result => {
        try {
          const entityId = metadata.extractEntityId?.(result, args) ?? null;
          const data = this.buildAuditData(metadata, args, result);
          const channelIdFromArgs =
            (args?.input as Record<string, unknown> | undefined)?.channelId ??
            (args as Record<string, unknown>)?.channelId;
          await this.auditService
            .log(ctx, metadata.eventType, {
              entityType: metadata.entityType ?? undefined,
              entityId: entityId ?? undefined,
              data,
              ...(channelIdFromArgs != null && channelIdFromArgs !== ''
                ? { channelId: channelIdFromArgs as number | string }
                : {}),
            })
            .catch(() => {}); // Non-blocking: don't fail the operation if audit fails
        } catch {
          // Swallow errors - audit logging must not break the operation
        }
      })
    );
  }

  private buildAuditData(
    metadata: AuditLogMetadata,
    args: Record<string, unknown>,
    result: unknown
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (metadata.includeArgs && args) {
      data.args = args;
    }
    if (metadata.includeResult && result !== undefined) {
      data.result = result;
    }
    return data;
  }
}
