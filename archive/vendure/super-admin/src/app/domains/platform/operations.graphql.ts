import { graphql } from '../../core/graphql/generated';

/**
 * Platform-level operations for the super-admin app.
 */

export const PLATFORM_ZONES = graphql(`
  query PlatformZones {
    platformZones {
      id
      name
    }
  }
`);

export const PLATFORM_MONITORING = graphql(`
  query PlatformMonitoring {
    platformMonitoring {
      processMemory {
        heapUsedMB
        heapTotalMB
        rssMB
      }
      systemMemory {
        totalMB
        freeMB
        usedMB
      }
      uptimeSeconds
      loadAvg
      services {
        name
        status
        error
      }
    }
  }
`);

export const PLATFORM_STATS = graphql(`
  query PlatformStats {
    platformStats {
      totalChannels
      channelsByStatus {
        UNAPPROVED
        APPROVED
        DISABLED
        BANNED
      }
      trialExpiringSoonCount
      activeSubscriptionsCount
    }
  }
`);

export const PLATFORM_SETTINGS = graphql(`
  query PlatformSettings {
    platformSettings {
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

export const UPDATE_PLATFORM_SETTINGS = graphql(`
  mutation UpdatePlatformSettings($trialDays: Int!) {
    updatePlatformSettings(trialDays: $trialDays) {
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

export const PLATFORM_ADMINISTRATORS = graphql(`
  query PlatformAdministrators($options: PlatformAdministratorListOptions) {
    platformAdministrators(options: $options) {
      items {
        id
        firstName
        lastName
        emailAddress
        userId
        identifier
        authorizationStatus
        roleCodes
        channelIds
        isSuperAdmin
      }
      totalItems
    }
  }
`);
