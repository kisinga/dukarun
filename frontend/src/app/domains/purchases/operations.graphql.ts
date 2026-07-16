import { graphql } from '../../shared/graphql/generated';

export const RECORD_PURCHASE = graphql(`
  mutation RecordPurchase($input: RecordPurchaseInput!) {
    recordPurchase(input: $input) {
      id
      supplierId
      purchaseDate
      referenceNumber
      totalCost
      paymentStatus
      notes
      lines {
        id
        variantId
        quantity
        unitCost
        totalCost
        stockLocationId
      }
      createdAt
      updatedAt
    }
  }
`);

export const GET_PURCHASES = graphql(`
  query GetPurchases($options: PurchaseListOptions) {
    purchases(options: $options) {
      items {
        id
        supplierId
        status
        supplier {
          id
          firstName
          lastName
          emailAddress
        }
        purchaseDate
        referenceNumber
        totalCost
        paymentStatus
        dueDate
        isOverdue
        isCreditPurchase
        notes
        lines {
          id
          variantId
          variant {
            id
            name
            product {
              id
              name
            }
          }
          quantity
          unitCost
          totalCost
          stockLocationId
          stockLocation {
            id
            name
          }
        }
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

export const GET_PURCHASE = graphql(`
  query GetPurchase($id: ID!) {
    purchase(id: $id) {
      id
      supplierId
      status
      supplier {
        id
        firstName
        lastName
        emailAddress
      }
      purchaseDate
      referenceNumber
      totalCost
      paymentStatus
      isCreditPurchase
      notes
      lines {
        id
        variantId
        variant {
          id
          name
          product {
            id
            name
          }
        }
        quantity
        unitCost
        totalCost
        stockLocationId
        stockLocation {
          id
          name
        }
      }
      createdAt
      updatedAt
    }
  }
`);

export const CONFIRM_PURCHASE = graphql(`
  mutation ConfirmPurchase($id: ID!) {
    confirmPurchase(id: $id) {
      id
      supplierId
      status
      referenceNumber
      totalCost
      paymentStatus
      lines {
        id
        variantId
        quantity
        unitCost
        totalCost
      }
    }
  }
`);

export const UPDATE_DRAFT_PURCHASE = graphql(`
  mutation UpdateDraftPurchase($id: ID!, $input: UpdateDraftPurchaseInput!) {
    updateDraftPurchase(id: $id, input: $input) {
      id
      supplierId
      status
      referenceNumber
      totalCost
      notes
      lines {
        id
        variantId
        quantity
        unitCost
        totalCost
      }
    }
  }
`);

export const PAY_SINGLE_PURCHASE = graphql(`
  mutation PaySinglePurchase($input: PaySinglePurchaseInput!) {
    paySinglePurchase(input: $input) {
      purchasesPaid {
        purchaseId
        purchaseReference
        amountPaid
      }
      remainingBalance
      totalAllocated
      excessPayment
    }
  }
`);

export const ALLOCATE_BULK_SUPPLIER_PAYMENT = graphql(`
  mutation AllocateBulkSupplierPayment($input: SupplierPaymentAllocationInput!) {
    allocateBulkSupplierPayment(input: $input) {
      purchasesPaid {
        purchaseId
        purchaseReference
        amountPaid
      }
      remainingBalance
      totalAllocated
      excessPayment
    }
  }
`);
