import { graphql } from '../../shared/graphql/generated';

export const GET_SUPPLIERS = graphql(`
  query GetSuppliers($options: CustomerListOptions) {
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
        supplierOutstandingAmount
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
          creditDuration
          isSupplierCreditApproved
          supplierCreditLimit
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
      }
    }
  }
`);

export const GET_SUPPLIER = graphql(`
  query GetSupplier($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
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
        lastRepaymentDate
        lastRepaymentAmount
        creditDuration
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
    }
  }
`);

export const CREATE_SUPPLIER = graphql(`
  mutation CreateSupplier($input: CreateCustomerInput!, $isWalkIn: Boolean) {
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
        creditDuration
      }
    }
  }
`);

export const UPDATE_SUPPLIER = graphql(`
  mutation UpdateSupplier($input: UpdateCustomerInput!) {
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
          creditDuration
        }
      }
      ... on EmailAddressConflictError {
        errorCode
        message
      }
    }
  }
`);

export const DELETE_SUPPLIER = graphql(`
  mutation DeleteSupplier($id: ID!) {
    deleteCustomer(id: $id) {
      result
      message
    }
  }
`);

