import { graphql } from '../../core/graphql/generated';

/**
 * Notification operations for the super-admin app.
 */

export const NOTIFICATIONS_FOR_CHANNEL = graphql(`
  query NotificationsForChannel($channelId: ID!, $options: NotificationListOptions) {
    notificationsForChannel(channelId: $channelId, options: $options) {
      items {
        id
        userId
        channelId
        type
        title
        message
        read
        createdAt
      }
      totalItems
    }
  }
`);

export const UPDATE_CUSTOMER_NOTIFICATIONS_ENABLED = graphql(`
  mutation UpdateCustomerNotificationsEnabled($enabled: Boolean!) {
    updateCustomerNotificationsEnabled(enabled: $enabled) {
      trialDays
      customerNotificationsEnabled
      communicationChannels {
        sms
        email
        whatsapp
      }
    }
  }
`);
