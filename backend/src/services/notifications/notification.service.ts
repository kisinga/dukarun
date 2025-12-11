import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, User } from '@vendure/core';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ChannelUserService } from '../auth/channel-user.service';

export interface NotificationData {
  [key: string]: any;
}

export interface CreateNotificationInput {
  userId: string;
  channelId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: NotificationData;
}

export enum NotificationType {
  ORDER = 'order',
  STOCK = 'stock',
  ML_TRAINING = 'ml_training',
  PAYMENT = 'payment',
  CASH_VARIANCE = 'cash_variance',
}

/**
 * User notification preferences structure.
 * Controls which notification channels are enabled per notification type.
 */
export interface UserNotificationPrefs {
  inApp?: Record<string, boolean>;
  sms?: Record<string, boolean> & { enabled?: boolean };
  push?: Record<string, boolean> & { enabled?: boolean };
}

@Entity()
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  channelId: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column('jsonb', { nullable: true })
  data: NotificationData;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity()
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  channelId: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column('jsonb')
  keys: {
    p256dh: string;
    auth: string;
  };

  @CreateDateColumn()
  createdAt: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private connection: TransactionalConnection,
    private channelUserService: ChannelUserService
  ) {}

  async createNotification(
    ctx: RequestContext,
    input: CreateNotificationInput
  ): Promise<Notification> {
    const notification = new Notification();
    notification.userId = input.userId;
    notification.channelId = input.channelId;
    notification.type = input.type;
    notification.title = input.title;
    notification.message = input.message;
    notification.data = input.data || {};
    notification.read = false;
    notification.createdAt = new Date();

    const savedNotification = await this.connection.rawConnection
      .getRepository(Notification)
      .save(notification);

    return savedNotification;
  }

  async getUserNotifications(
    ctx: RequestContext,
    userId: string,
    channelId: string,
    options: { skip?: number; take?: number; type?: NotificationType } = {}
  ): Promise<{ items: Notification[]; totalItems: number }> {
    const skip = options.skip || 0;
    const take = options.take || 20;

    const where: any = { userId, channelId };
    if (options.type) {
      where.type = options.type;
    }

    const [items, totalItems] = await this.connection.rawConnection
      .getRepository(Notification)
      .findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip,
        take,
      });

    return { items, totalItems };
  }

  async getUnreadCount(ctx: RequestContext, userId: string, channelId: string): Promise<number> {
    return this.connection.rawConnection.getRepository(Notification).count({
      where: { userId, channelId, read: false },
    });
  }

  async markAsRead(ctx: RequestContext, notificationId: string): Promise<boolean> {
    const result = await this.connection.rawConnection
      .getRepository(Notification)
      .update({ id: notificationId }, { read: true });
    return (result.affected || 0) > 0;
  }

  async markAllAsRead(ctx: RequestContext, userId: string, channelId: string): Promise<number> {
    const result = await this.connection.rawConnection
      .getRepository(Notification)
      .update({ userId, channelId, read: false }, { read: true });
    return result.affected || 0;
  }

  async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.connection.rawConnection
      .getRepository(Notification)
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }

  async getChannelUsers(channelId: string): Promise<string[]> {
    return this.channelUserService.getChannelAdminUserIds(RequestContext.empty(), channelId);
  }

  // ============================================================================
  // PREFERENCE-AWARE NOTIFICATION METHODS
  // Customization happens here in the notification layer, not the event layer.
  // ============================================================================

  /**
   * Get user's notification preferences for a channel.
   * Returns preferences merged with defaults.
   */
  async getUserPreferences(
    ctx: RequestContext,
    userId: string,
    channelId: string
  ): Promise<UserNotificationPrefs> {
    try {
      const userRepo = this.connection.rawConnection.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId as any } });

      if (!user) {
        return this.getDefaultPreferences();
      }

      const customFields = (user as any).customFields;
      const userPrefs = customFields?.notificationPreferences;

      if (userPrefs) {
        try {
          const parsed = typeof userPrefs === 'string' ? JSON.parse(userPrefs) : userPrefs;
          return { ...this.getDefaultPreferences(), ...parsed };
        } catch {
          // Invalid JSON, return defaults
        }
      }

      return this.getDefaultPreferences();
    } catch (error) {
      this.logger.warn(`Failed to get user preferences: ${error}`);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Default preferences - all notifications enabled
   */
  private getDefaultPreferences(): UserNotificationPrefs {
    return {
      inApp: {
        [NotificationType.ORDER]: true,
        [NotificationType.STOCK]: true,
        [NotificationType.ML_TRAINING]: true,
        [NotificationType.PAYMENT]: true,
        [NotificationType.CASH_VARIANCE]: true,
      },
      sms: { enabled: true },
      push: { enabled: true },
    };
  }

  /**
   * Create an in-app notification only if user has opted in.
   * Returns null if notification was skipped due to preferences.
   */
  async createNotificationIfEnabled(
    ctx: RequestContext,
    input: CreateNotificationInput
  ): Promise<Notification | null> {
    const prefs = await this.getUserPreferences(ctx, input.userId, input.channelId);

    // Check if in-app notifications are enabled for this type
    if (prefs.inApp?.[input.type] === false) {
      return null;
    }

    return this.createNotification(ctx, input);
  }

  /**
   * Check if SMS notifications are enabled for a user
   */
  async isSmsEnabled(
    ctx: RequestContext,
    userId: string,
    channelId: string,
    notificationType?: NotificationType
  ): Promise<boolean> {
    const prefs = await this.getUserPreferences(ctx, userId, channelId);

    if (!prefs.sms?.enabled) {
      return false;
    }

    if (notificationType && prefs.sms[notificationType] === false) {
      return false;
    }

    return true;
  }

  /**
   * Check if push notifications are enabled for a user
   */
  async isPushEnabled(
    ctx: RequestContext,
    userId: string,
    channelId: string,
    notificationType?: NotificationType
  ): Promise<boolean> {
    const prefs = await this.getUserPreferences(ctx, userId, channelId);

    if (!prefs.push?.enabled) {
      return false;
    }

    if (notificationType && prefs.push[notificationType] === false) {
      return false;
    }

    return true;
  }
}
