import type { SmsCategory } from '../../domain/sms-categories';
import { NotificationType } from './notification.service';

export type OutboundAudience = 'channel_admins' | 'customer' | 'platform_admin';

export interface OutboundChannels {
  inApp: boolean;
  sms: boolean;
  email: boolean;
}

export interface OutboundTriggerConfig {
  audience: OutboundAudience;
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
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ORDER,
  },
  order_fulfilled: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ORDER,
  },
  order_cancelled: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ORDER,
  },
  // Subscription (channel admins, in-app)
  subscription_expiring_soon: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  subscription_expired: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  subscription_renewed: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  // ML status (channel admins, in-app)
  ml_status: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ML_TRAINING,
  },
  // Admin action (channel admins, in-app)
  admin_action: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ORDER,
  },
  // Customer events: in-app to admins
  customer_created: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  credit_approved: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  balance_changed_admin: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  repayment_deadline: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  // Balance change: email to customer only (in-app to admins is balance_changed_admin)
  balance_changed: {
    audience: 'customer',
    channels: { inApp: false, sms: false, email: true },
    inAppType: NotificationType.PAYMENT,
  },
  // Channel status (channel admins, in-app)
  channel_approved: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ORDER,
  },
  channel_status_changed: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.ORDER,
  },
  // Stock (channel admins, in-app)
  stock_low: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.STOCK,
  },
  // Company registered (platform admin, email only)
  company_registered: {
    audience: 'platform_admin',
    channels: { inApp: false, sms: false, email: true },
    inAppType: NotificationType.ORDER,
  },
  // Approval (channel admins or requester, in-app)
  approval_created: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.APPROVAL,
  },
  approval_resolved: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.APPROVAL,
  },
  // Shift (channel admins, in-app)
  shift_opened: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
  shift_closed: {
    audience: 'channel_admins',
    channels: { inApp: true, sms: false, email: false },
    inAppType: NotificationType.PAYMENT,
  },
};
