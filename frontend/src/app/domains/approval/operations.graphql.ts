import { graphql } from '../../shared/graphql/generated';

export const GET_APPROVAL_REQUESTS = graphql(`
  query GetApprovalRequests($options: ApprovalRequestListOptions) {
    getApprovalRequests(options: $options) {
      items {
        id
        channelId
        type
        status
        dueAt
        requestedById
        reviewedById
        reviewedAt
        message
        rejectionReasonCode
        metadata
        entityType
        entityId
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

export const GET_APPROVAL_REQUEST = graphql(`
  query GetApprovalRequest($id: ID!) {
    getApprovalRequest(id: $id) {
      id
      channelId
      type
      status
      dueAt
      requestedById
      reviewedById
      reviewedAt
      message
      rejectionReasonCode
      metadata
      entityType
      entityId
      createdAt
      updatedAt
    }
  }
`);

export const GET_MY_APPROVAL_REQUESTS = graphql(`
  query GetMyApprovalRequests($options: ApprovalRequestListOptions) {
    getMyApprovalRequests(options: $options) {
      items {
        id
        channelId
        type
        status
        dueAt
        requestedById
        reviewedById
        reviewedAt
        message
        rejectionReasonCode
        metadata
        entityType
        entityId
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

export const CREATE_APPROVAL_REQUEST = graphql(`
  mutation CreateApprovalRequest($input: CreateApprovalRequestInput!) {
    createApprovalRequest(input: $input) {
      id
      type
      status
      createdAt
    }
  }
`);

export const REVIEW_APPROVAL_REQUEST = graphql(`
  mutation ReviewApprovalRequest($input: ReviewApprovalRequestInput!) {
    reviewApprovalRequest(input: $input) {
      id
      type
      status
      message
      reviewedAt
    }
  }
`);

