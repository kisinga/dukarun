import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_METADATA = 'audit_log';

export interface AuditLogMetadata {
  eventType: string;
  entityType?: string;
  extractEntityId?: (result: any, args: any) => string | null;
  includeArgs?: boolean;
  includeResult?: boolean;
}

/**
 * Decorator to mark resolver methods for automatic audit logging.
 * When applied to a mutation, the AuditLogInterceptor will automatically
 * log the event after successful execution.
 */
export function AuditLog(metadata: AuditLogMetadata): MethodDecorator {
  return SetMetadata(AUDIT_LOG_METADATA, metadata);
}
