import { graphql } from '../../core/graphql/generated';

/**
 * Messaging / batch message operations for the super-admin app.
 */

export const BATCH_MESSAGES = graphql(`
  query BatchMessages($options: BatchMessageListOptions) {
    batchMessages(options: $options) {
      items {
        id
        name
        content
        audience
        channelIds
        channels {
          sms
          whatsapp
        }
        status
        recipientCount
        sentCount
        failedCount
        createdAt
        sentAt
      }
      totalItems
    }
  }
`);

export const SEND_BATCH_MESSAGE = graphql(`
  mutation SendBatchMessage($input: CreateBatchMessageInput!) {
    sendBatchMessage(input: $input) {
      id
      name
      status
      recipientCount
      createdAt
    }
  }
`);

export const SEND_TEST_CUSTOMER_NOTIFICATION = graphql(`
  mutation SendTestCustomerNotification(
    $channelId: ID!
    $customerId: ID!
    $triggerKey: String!
  ) {
    sendTestCustomerNotification(
      channelId: $channelId
      customerId: $customerId
      triggerKey: $triggerKey
    ) {
      success
      channel
      error
      info
    }
  }
`);

export const SEND_TEST_WHATSAPP_NOTIFICATION = graphql(`
  mutation SendTestWhatsAppNotification(
    $phoneNumber: String!
    $message: String!
    $templateKey: String
  ) {
    sendTestWhatsAppNotification(
      phoneNumber: $phoneNumber
      message: $message
      templateKey: $templateKey
    ) {
      success
      channel
      error
      info
    }
  }
`);
