import { ActionCategory } from '../types/action-category.enum';
import { ChannelEventType, EventMetadata } from '../types/event-type.enum';

export const EVENT_METADATA: Record<ChannelEventType, EventMetadata> = {
  [ChannelEventType.ORDER_PAYMENT_SETTLED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ORDER_FULFILLED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ORDER_CANCELLED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.STOCK_LOW_ALERT]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_TRAINING_STARTED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_TRAINING_PROGRESS]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_TRAINING_COMPLETED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_TRAINING_FAILED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_EXTRACTION_QUEUED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_EXTRACTION_STARTED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_EXTRACTION_COMPLETED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ML_EXTRACTION_FAILED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.PAYMENT_CONFIRMED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.CUSTOMER_CREATED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.CUSTOMER_COMMUNICATION,
  },
  [ChannelEventType.CUSTOMER_CREDIT_APPROVED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.CUSTOMER_COMMUNICATION,
  },
  [ChannelEventType.CUSTOMER_BALANCE_CHANGED]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.CUSTOMER_COMMUNICATION,
  },
  [ChannelEventType.CUSTOMER_REPAYMENT_DEADLINE]: {
    subscribable: true,
    customerFacing: true,
    defaultEnabled: true,
    category: ActionCategory.CUSTOMER_COMMUNICATION,
  },
  [ChannelEventType.ADMIN_CREATED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.ADMIN_UPDATED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.USER_CREATED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.USER_UPDATED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: false,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.SUBSCRIPTION_EXPIRING_SOON]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.SUBSCRIPTION_EXPIRED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.SUBSCRIPTION_RENEWED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
  [ChannelEventType.CHANNEL_APPROVED]: {
    subscribable: false,
    customerFacing: false,
    defaultEnabled: true,
    category: ActionCategory.SYSTEM_NOTIFICATIONS,
  },
};

export const EVENT_METADATA_MAP = new Map<ChannelEventType, EventMetadata>(
  Object.entries(EVENT_METADATA).map(([eventType, metadata]) => [
    eventType as ChannelEventType,
    metadata,
  ])
);
