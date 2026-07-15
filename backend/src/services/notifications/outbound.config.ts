import type { SmsCategory } from '../../domain/sms-categories';
import { NotificationCategory, NotificationType } from './notification.service';

export type OutboundAudience = 'channel_admins' | 'customer' | 'platform_admin';

export interface OutboundChannels {
  inApp: boolean;
  sms: boolean;
  email: boolean;
  whatsapp: boolean;
}

export interface OutboundTriggerConfig {
  audience: OutboundAudience;
  category?: NotificationCategory;
  channels: OutboundChannels;
  inAppType: NotificationType;
  /** When set, used for SMS send (e.g. ACCOUNT_NOTIFICATION, ADMIN). Omit to use default NOTIFICATION. */
  smsCategory?: SmsCategory;
}

/**
 * Single source of truth: for each trigger key, who receives and via which channels.
 * One row per (trigger, audience). For triggers that need both in-app to admins and SMS to customer,
 * use two keys (e.g. balance_changed_admin, balance_changed).
 */
export const OUTBOUND_CONFIG: Record<string, OutboundTriggerConfig> = {
  // Order (channel admins, in-app)
  order_payment_settled: {
    audience: 'channel_admins',
    category: 'orders',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  order_fulfilled: {
    audience: 'channel_admins',
    category: 'orders',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  order_cancelled: {
    audience: 'channel_admins',
    category: 'orders',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  // Subscription (channel admins)
  subscription_expiring_soon: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: true, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  subscription_renewed: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  subscription_expired: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  subscription_grace_period_ending: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  subscription_hard_expired: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  // ML status (channel admins, in-app)
  ml_status: {
    audience: 'channel_admins',
    category: 'operations',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ML_TRAINING,
  },
  // Admin action (channel admins, in-app)
  admin_action: {
    audience: 'channel_admins',
    category: 'operations',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  // Customer events: in-app to admins
  customer_created: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  credit_approved: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  balance_changed_admin: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  repayment_deadline: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  // Balance change: WhatsApp and email to customer (in-app to admins is balance_changed_admin)
  balance_changed: {
    audience: 'customer',
    category: 'customer',
    channels: { inApp: false, sms: false, email: true, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
  // Credit reminders: customer (WhatsApp/email) + admin (in-app)
  credit_period_3_days: {
    audience: 'customer',
    category: 'customer',
    channels: { inApp: false, sms: false, email: true, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
  credit_period_3_days_admin: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  credit_period_7_days: {
    audience: 'customer',
    category: 'customer',
    channels: { inApp: false, sms: false, email: true, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
  credit_period_7_days_admin: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  credit_period_10_days_frozen: {
    audience: 'customer',
    category: 'customer',
    channels: { inApp: false, sms: false, email: true, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
  credit_period_10_days_frozen_admin: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  credit_limit_reached: {
    audience: 'customer',
    category: 'customer',
    channels: { inApp: false, sms: false, email: true, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
  credit_limit_reached_admin: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  credit_sale_blocked: {
    audience: 'channel_admins',
    category: 'customer',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.PAYMENT,
  },
  // Channel status (channel admins, in-app)
  channel_approved: {
    audience: 'channel_admins',
    category: 'operations',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  channel_status_changed: {
    audience: 'channel_admins',
    category: 'operations',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  // Stock (channel admins, in-app)
  stock_low: {
    audience: 'channel_admins',
    category: 'stock',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.STOCK,
  },
  // Company registered (platform admin, email only)
  company_registered: {
    audience: 'platform_admin',
    channels: { inApp: false, sms: false, email: true, whatsapp: false },
    inAppType: NotificationType.ORDER,
  },
  // Approval (channel admins or requester, in-app)
  approval_created: {
    audience: 'channel_admins',
    category: 'operations',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.APPROVAL,
  },
  approval_resolved: {
    audience: 'channel_admins',
    category: 'operations',
    channels: { inApp: true, sms: false, email: false, whatsapp: false },
    inAppType: NotificationType.APPROVAL,
  },
  // Shift (channel admins, in-app + WhatsApp)
  shift_opened: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: false, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
  shift_closed: {
    audience: 'channel_admins',
    category: 'finance',
    channels: { inApp: true, sms: false, email: false, whatsapp: true },
    inAppType: NotificationType.PAYMENT,
  },
};
