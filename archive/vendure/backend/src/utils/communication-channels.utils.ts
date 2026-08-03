export interface CommunicationChannels {
  sms: boolean;
  email: boolean;
  whatsapp: boolean;
}

export const DEFAULT_COMMUNICATION_CHANNELS: CommunicationChannels = {
  sms: true,
  email: true,
  whatsapp: true,
};

/**
 * Parse communication channel toggles from a raw value (typically a JSON string stored
 * in GlobalSettings.customFields.communicationChannels). Missing or invalid values fall
 * back to all channels enabled.
 */
export function parseCommunicationChannels(raw: unknown): CommunicationChannels {
  if (!raw || typeof raw !== 'string') {
    return { ...DEFAULT_COMMUNICATION_CHANNELS };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_COMMUNICATION_CHANNELS };
    }
    return {
      sms: parsed.sms !== false,
      email: parsed.email !== false,
      whatsapp: parsed.whatsapp !== false,
    };
  } catch {
    return { ...DEFAULT_COMMUNICATION_CHANNELS };
  }
}
