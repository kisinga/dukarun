import { graphql } from '../../shared/graphql/generated';

export const GET_USER_NOTIFICATIONS = graphql(`
  query GetUserNotifications($options: NotificationListOptions) {
    getUserNotifications(options: $options) {
      items {
        id
        userId
        channelId
        type
        title
        message
        data
        read
        createdAt
      }
      totalItems
    }
  }
`);

export const GET_UNREAD_COUNT = graphql(`
  query GetUnreadCount {
    getUnreadCount
  }
`);

export const MARK_NOTIFICATION_AS_READ = graphql(`
  mutation MarkNotificationAsRead($id: ID!) {
    markNotificationAsRead(id: $id)
  }
`);

export const MARK_ALL_AS_READ = graphql(`
  mutation MarkAllAsRead {
    markAllAsRead
  }
`);

export const SUBSCRIBE_TO_PUSH = graphql(`
  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {
    subscribeToPush(subscription: $subscription)
  }
`);

export const UNSUBSCRIBE_TO_PUSH = graphql(`
  mutation UnsubscribeToPush {
    unsubscribeToPush
  }
`);

