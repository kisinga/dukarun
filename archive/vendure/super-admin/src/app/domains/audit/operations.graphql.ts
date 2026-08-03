import { graphql } from '../../core/graphql/generated';

/**
 * Audit log operations for the super-admin app.
 */

export const AUDIT_LOGS_FOR_CHANNEL = graphql(`
  query AuditLogsForChannel($channelId: ID!, $options: AuditLogOptions) {
    auditLogsForChannel(channelId: $channelId, options: $options) {
      id
      timestamp
      eventType
      entityType
      entityId
      userId
      data
    }
  }
`);
