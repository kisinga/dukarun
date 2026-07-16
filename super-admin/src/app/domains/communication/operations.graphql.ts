import { graphql } from '../../core/graphql/generated';

/**
 * Communication channel operations for the super-admin app.
 */

export const UPDATE_COMMUNICATION_CHANNELS = graphql(`
  mutation UpdateCommunicationChannels($input: CommunicationChannelsInput!) {
    updateCommunicationChannels(input: $input) {
      trialDays
      customerNotificationsEnabled
      communicationChannels {
        sms
        email
        whatsapp
      }
    }
  }
`);
