import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import gql from 'graphql-tag';
import { NotificationService } from '../../services/notifications/notification.service';
import { PushNotificationService } from '../../services/notifications/push-notification.service';

export const notificationSchema = gql`
  enum NotificationType {
    ORDER
    STOCK
    ML_TRAINING
    PAYMENT
    CASH_VARIANCE
    APPROVAL
  }

  type Notification {
    id: ID!
    userId: ID!
    channelId: ID!
    type: NotificationType!
    title: String!
    message: String!
    data: JSON
    read: Boolean!
    createdAt: DateTime!
  }

  type NotificationList {
    items: [Notification!]!
    totalItems: Int!
  }

  input NotificationListOptions {
    skip: Int
    take: Int
    type: NotificationType
  }

  input PushSubscriptionInput {
    endpoint: String!
    keys: JSON!
  }

  extend type Query {
    getUserNotifications(options: NotificationListOptions): NotificationList!
    getUnreadCount: Int!
  }

  extend type Mutation {
    markNotificationAsRead(id: ID!): Boolean!
    markAllAsRead: Int!
    subscribeToPush(subscription: PushSubscriptionInput!): Boolean!
    unsubscribeToPush: Boolean!
  }
`;

@Resolver()
export class NotificationResolver {
  constructor(
    private notificationService: NotificationService,
    private pushNotificationService: PushNotificationService
  ) {}

  @Query()
  async getUserNotifications(@Ctx() ctx: RequestContext, @Args('options') options: any = {}) {
    // Get current user and channel from context
    const userId = ctx.activeUserId;
    const channelId = ctx.channelId;

    if (!userId || !channelId) {
      return { items: [], totalItems: 0 };
    }

    return this.notificationService.getUserNotifications(
      ctx,
      String(userId),
      String(channelId),
      options
    );
  }

  @Query()
  async getUnreadCount(@Ctx() ctx: RequestContext) {
    const userId = ctx.activeUserId;
    const channelId = ctx.channelId;

    if (!userId || !channelId) {
      return 0;
    }

    return this.notificationService.getUnreadCount(ctx, String(userId), String(channelId));
  }

  @Mutation()
  async markNotificationAsRead(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    return this.notificationService.markAsRead(ctx, String(id));
  }

  @Mutation()
  async markAllAsRead(@Ctx() ctx: RequestContext) {
    const userId = ctx.activeUserId;
    const channelId = ctx.channelId;

    if (!userId || !channelId) {
      return 0;
    }

    return this.notificationService.markAllAsRead(ctx, String(userId), String(channelId));
  }

  @Mutation()
  async subscribeToPush(@Ctx() ctx: RequestContext, @Args('subscription') subscription: any) {
    const userId = ctx.activeUserId;
    const channelId = ctx.channelId;

    if (!userId || !channelId) {
      return false;
    }

    return this.pushNotificationService.subscribeToPush(
      ctx,
      String(userId),
      String(channelId),
      subscription
    );
  }

  @Mutation()
  async unsubscribeToPush(@Ctx() ctx: RequestContext) {
    const userId = ctx.activeUserId;

    if (!userId) {
      return false;
    }

    return this.pushNotificationService.unsubscribeFromPush(ctx, String(userId));
  }
}
