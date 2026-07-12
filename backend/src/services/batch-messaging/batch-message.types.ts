export type BatchMessageAudience =
  | 'ALL_ADMINS'
  | 'SUPER_ADMINS'
  | 'CHANNEL_ADMINS'
  | 'FINANCIAL_ADMINS'
  | 'CUSTOM_USER_IDS';

export const BATCH_MESSAGE_AUDIENCES: BatchMessageAudience[] = [
  'ALL_ADMINS',
  'SUPER_ADMINS',
  'CHANNEL_ADMINS',
  'FINANCIAL_ADMINS',
  'CUSTOM_USER_IDS',
];

export interface BatchMessageChannels {
  sms: boolean;
  whatsapp: boolean;
}

export interface CreateBatchMessageInput {
  name: string;
  content: string;
  audience: BatchMessageAudience;
  channelIds?: string[];
  customUserIds?: string[];
  channels: BatchMessageChannels;
}

export type BatchMessageStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'PARTIAL' | 'FAILED';

export interface BatchMessageRecipient {
  userId: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  emailAddress?: string;
  channelId?: string;
  channelName?: string;
  channelCode?: string;
}

export interface BatchMessageFailureEntry {
  userId: string;
  channel: 'sms' | 'whatsapp';
  error: string;
}
