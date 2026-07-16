import { graphql } from '../../shared/graphql/generated';

export const GET_CUSTOMERS = graphql(`
  query GetCustomers($options: CustomerListOptions) {
    customers(options: $options) {
      totalItems
      items {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        createdAt
        updatedAt
        outstandingAmount
        daysOverdue
        isOverdue
        supplierOutstandingAmount
        supplierDaysOverdue
        supplierIsOverdue
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
          lastRepaymentDate
          lastRepaymentAmount
          creditDuration
          notificationsEnabled
        }
        addresses {
          id
          fullName
          streetLine1
          streetLine2
          city
          postalCode
          country {
            code
            name
          }
          phoneNumber
        }
        user {
          id
          identifier
          verified
        }
      }
    }
  }
`);

export const GET_CUSTOMER = graphql(`
  query GetCustomer($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
      updatedAt
      outstandingAmount
      daysOverdue
      isOverdue
      supplierOutstandingAmount
      supplierDaysOverdue
      supplierIsOverdue
      customFields {
        isSupplier
        supplierType
        contactPerson
        taxId
        paymentTerms
        notes
        isCreditApproved
        creditLimit
        lastRepaymentDate
        lastRepaymentAmount
        creditDuration
        notificationsEnabled
      }
      addresses {
        id
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        country {
          code
          name
        }
        phoneNumber
      }
      user {
        id
        identifier
        verified
      }
    }
  }
`);

export const CREATE_CUSTOMER = graphql(`
  mutation CreateCustomer($input: CreateCustomerInput!, $isWalkIn: Boolean) {
    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
      customFields {
        isSupplier
        supplierType
        contactPerson
        taxId
        paymentTerms
        notes
        isCreditApproved
        creditLimit
      }
    }
  }
`);

export const UPDATE_CUSTOMER = graphql(`
  mutation UpdateCustomer($input: UpdateCustomerInput!) {
    updateCustomer(input: $input) {
      ... on Customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        updatedAt
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
          notificationsEnabled
        }
      }
      ... on EmailAddressConflictError {
        errorCode
        message
      }
    }
  }
`);

export const DELETE_CUSTOMER = graphql(`
  mutation DeleteCustomer($id: ID!) {
    deleteCustomer(id: $id) {
      result
      message
    }
  }
`);

export const CREATE_CUSTOMER_ADDRESS = graphql(`
  mutation CreateCustomerAddress($customerId: ID!, $input: CreateAddressInput!) {
    createCustomerAddress(customerId: $customerId, input: $input) {
      id
      fullName
      streetLine1
      streetLine2
      city
      postalCode
      country {
        code
        name
      }
      phoneNumber
    }
  }
`);

export const UPDATE_CUSTOMER_ADDRESS = graphql(`
  mutation UpdateCustomerAddress($input: UpdateAddressInput!) {
    updateCustomerAddress(input: $input) {
      id
      fullName
      streetLine1
      streetLine2
      city
      postalCode
      country {
        code
        name
      }
      phoneNumber
    }
  }
`);

export const DELETE_CUSTOMER_ADDRESS = graphql(`
  mutation DeleteCustomerAddress($id: ID!) {
    deleteCustomerAddress(id: $id) {
      success
    }
  }
`);

