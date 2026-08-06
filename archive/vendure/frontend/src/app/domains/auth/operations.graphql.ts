import { graphql } from '../../shared/graphql/generated';

export const GET_ACTIVE_ADMIN = graphql(`
  query GetActiveAdministrator {
    activeAdministrator {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
      customFields {
        profilePicture {
          id
          preview
          source
        }
      }
    }
  }
`);

export const LOGIN = graphql(`
  mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {
    login(username: $username, password: $password, rememberMe: $rememberMe) {
      ... on CurrentUser {
        id
        identifier
        channels {
          id
          code
          token
        }
      }
      ... on InvalidCredentialsError {
        errorCode
        message
      }
      ... on NativeAuthStrategyError {
        errorCode
        message
      }
    }
  }
`);

export const REQUEST_REGISTRATION_OTP = graphql(`
  mutation RequestRegistrationOTP($phoneNumber: String!, $registrationData: RegistrationInput!) {
    requestRegistrationOTP(phoneNumber: $phoneNumber, registrationData: $registrationData) {
      success
      message
      sessionId
      expiresAt
    }
  }
`);

export const VERIFY_REGISTRATION_OTP = graphql(`
  mutation VerifyRegistrationOTP($phoneNumber: String!, $otp: String!, $sessionId: String!) {
    verifyRegistrationOTP(phoneNumber: $phoneNumber, otp: $otp, sessionId: $sessionId) {
      success
      userId
      message
    }
  }
`);

export const REQUEST_LOGIN_OTP = graphql(`
  mutation RequestLoginOTP($phoneNumber: String!) {
    requestLoginOTP(phoneNumber: $phoneNumber) {
      success
      message
      expiresAt
    }
  }
`);

export const VERIFY_LOGIN_OTP = graphql(`
  mutation VerifyLoginOTP($phoneNumber: String!, $otp: String!) {
    verifyLoginOTP(phoneNumber: $phoneNumber, otp: $otp) {
      success
      token
      user {
        id
        identifier
      }
      message
    }
  }
`);

export const CHECK_AUTHORIZATION_STATUS = graphql(`
  query CheckAuthorizationStatus($identifier: String!) {
    checkAuthorizationStatus(identifier: $identifier) {
      status
      message
    }
  }
`);

export const CHECK_COMPANY_CODE_AVAILABILITY = graphql(`
  query CheckCompanyCodeAvailability($companyCode: String!) {
    checkCompanyCodeAvailability(companyCode: $companyCode)
  }
`);

export const LOGOUT = graphql(`
  mutation Logout {
    logout {
      success
    }
  }
`);

export const UPDATE_ADMINISTRATOR = graphql(`
  mutation UpdateAdministrator($input: UpdateActiveAdministratorInput!) {
    updateActiveAdministrator(input: $input) {
      id
      firstName
      lastName
      emailAddress
      customFields {
        profilePicture {
          id
          preview
          source
        }
      }
    }
  }
`);

export const UPDATE_ADMIN_PROFILE = graphql(`
  mutation UpdateAdminProfile($input: UpdateAdminProfileInput!) {
    updateAdminProfile(input: $input) {
      id
      firstName
      lastName
    }
  }
`);

export const GET_USER_CHANNELS = graphql(`
  query GetUserChannels {
    me {
      id
      identifier
      channels {
        id
        code
        token
      }
    }
  }
`);

export const GET_ACTIVE_CHANNEL = graphql(`
  query GetActiveChannel {
    activeChannel {
      id
      code
      token
      defaultCurrencyCode
      customFields {
        companyLogoAsset {
          id
          source
          name
          preview
        }
        cashierFlowEnabled
        batchExpiryEnabled
        lowStockThreshold
        enablePrinter
        subscriptionStatus
        trialEndsAt
        subscriptionExpiresAt
      }
    }
  }
`) as any;
