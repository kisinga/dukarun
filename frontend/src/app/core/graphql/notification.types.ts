// Mock types for notification GraphQL operations
// These will be replaced by generated types once codegen runs

export interface Notification {
  id: string;
  userId: string;
  channelId: string;
  type: 'ORDER' | 'STOCK' | 'ML_TRAINING' | 'PAYMENT' | 'CASH_VARIANCE' | 'APPROVAL';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  totalItems: number;
}

export interface NotificationListOptions {
  skip?: number;
  take?: number;
  type?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Mock GraphQL operations
export const GET_USER_NOTIFICATIONS = `
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
`;

export const GET_UNREAD_COUNT = `
  query GetUnreadCount {
    getUnreadCount
  }
`;

export const MARK_NOTIFICATION_AS_READ = `
  mutation MarkNotificationAsRead($id: ID!) {
    markNotificationAsRead(id: $id)
  }
`;

export const MARK_ALL_AS_READ = `
  mutation MarkAllAsRead {
    markAllAsRead
  }
`;

export const SUBSCRIBE_TO_PUSH = `
  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {
    subscribeToPush(subscription: $subscription)
  }
`;

export const UNSUBSCRIBE_TO_PUSH = `
  mutation UnsubscribeToPush {
    unsubscribeToPush
  }
`;
