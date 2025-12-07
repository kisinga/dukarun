import { ActionCategory } from './action-category.enum';

/**
 * Channel Event Types
 *
 * Defines all events that can trigger actions in the channel events framework.
 * Events are categorized as either system events (channel-level) or customer-facing events (user-subscribable).
 */
export enum ChannelEventType {
  // Order Events (Customer-Facing, Subscribable)
  ORDER_PAYMENT_SETTLED = 'order_payment_settled',
  ORDER_FULFILLED = 'order_fulfilled',
  ORDER_CANCELLED = 'order_cancelled',

  // Stock Events (Can be customer-facing or system)
  STOCK_LOW_ALERT = 'stock_low_alert',

  // ML Training Events (System, Not Subscribable)
  ML_TRAINING_STARTED = 'ml_training_started',
  ML_TRAINING_PROGRESS = 'ml_training_progress',
  ML_TRAINING_COMPLETED = 'ml_training_completed',
  ML_TRAINING_FAILED = 'ml_training_failed',

  // ML Extraction Events (System, Not Subscribable)
  ML_EXTRACTION_QUEUED = 'ml_extraction_queued',
  ML_EXTRACTION_STARTED = 'ml_extraction_started',
  ML_EXTRACTION_COMPLETED = 'ml_extraction_completed',
  ML_EXTRACTION_FAILED = 'ml_extraction_failed',

  // Payment Events (Customer-Facing, Subscribable)
  PAYMENT_CONFIRMED = 'payment_confirmed',

  // Customer Events (Customer-Facing, Subscribable)
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_CREDIT_APPROVED = 'customer_credit_approved',
  CUSTOMER_BALANCE_CHANGED = 'customer_balance_changed',
  CUSTOMER_REPAYMENT_DEADLINE = 'customer_repayment_deadline',

  // Admin/User Events (System, Not Subscribable)
  ADMIN_CREATED = 'admin_created',
  ADMIN_UPDATED = 'admin_updated',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',

  // Subscription Events (System, Not Subscribable)
  SUBSCRIPTION_EXPIRING_SOON = 'subscription_expiring_soon',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',

  // Channel Events (System, Not Subscribable)
  CHANNEL_APPROVED = 'channel_approved',
}

/**
 * Event Metadata
 *
 * Defines metadata for each event type including whether it's subscribable,
 * customer-facing, and default subscription state.
 */
export interface EventMetadata {
  subscribable: boolean; // Can users opt-in/opt-out?
  customerFacing: boolean; // Is this event for customers?
  defaultEnabled: boolean; // Default subscription state for subscribable events
  category: ActionCategory; // Which category this event belongs to
}
