import { graphql } from '../../core/graphql/generated';

/**
 * Registration operations for the super-admin app.
 */

export const PENDING_REGISTRATIONS = graphql(`
  query PendingRegistrations {
    pendingRegistrations {
      userId
      identifier
      createdAt
      administrator {
        id
        firstName
        lastName
        emailAddress
      }
    }
  }
`);

export const REGISTRATION_SEED_CONTEXT = graphql(`
  query RegistrationSeedContext {
    registrationSeedContext {
      zone {
        id
        name
        members {
          id
          name
          code
        }
      }
      taxRate {
        id
        name
        categoryName
        value
      }
    }
  }
`);

export const UPDATE_REGISTRATION_TAX_RATE = graphql(`
  mutation UpdateRegistrationTaxRate($input: UpdateRegistrationTaxRateInput!) {
    updateRegistrationTaxRate(input: $input) {
      id
      name
      categoryName
      value
    }
  }
`);
