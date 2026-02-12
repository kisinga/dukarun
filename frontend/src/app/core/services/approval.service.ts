import { Injectable, inject, signal } from '@angular/core';
import { ApolloService } from './apollo.service';
import {
  GET_APPROVAL_REQUESTS,
  GET_APPROVAL_REQUEST,
  GET_MY_APPROVAL_REQUESTS,
  CREATE_APPROVAL_REQUEST,
  REVIEW_APPROVAL_REQUEST,
} from '../graphql/operations.graphql';

export interface ApprovalRequest {
  id: string;
  channelId: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  message: string | null;
  metadata: Record<string, any>;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequestList {
  items: ApprovalRequest[];
  totalItems: number;
}

@Injectable({ providedIn: 'root' })
export class ApprovalService {
  private readonly apolloService = inject(ApolloService);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async getApprovalRequests(options?: {
    skip?: number;
    take?: number;
    status?: string;
    type?: string;
  }): Promise<ApprovalRequestList> {
    const client = this.apolloService.getClient();
    const result = await client.query({
      query: GET_APPROVAL_REQUESTS,
      variables: { options: options ?? {} },
      fetchPolicy: 'network-only',
    });
    return result.data!.getApprovalRequests as unknown as ApprovalRequestList;
  }

  async getApproval(id: string): Promise<ApprovalRequest | null> {
    const client = this.apolloService.getClient();
    const result = await client.query({
      query: GET_APPROVAL_REQUEST,
      variables: { id },
      fetchPolicy: 'network-only',
    });
    return (result.data!.getApprovalRequest as unknown as ApprovalRequest) ?? null;
  }

  async getMyApprovalRequests(options?: {
    skip?: number;
    take?: number;
    status?: string;
    type?: string;
  }): Promise<ApprovalRequestList> {
    const client = this.apolloService.getClient();
    const result = await client.query({
      query: GET_MY_APPROVAL_REQUESTS,
      variables: { options: options ?? {} },
      fetchPolicy: 'network-only',
    });
    return result.data!.getMyApprovalRequests as unknown as ApprovalRequestList;
  }

  async createApprovalRequest(input: {
    type: string;
    metadata?: Record<string, any>;
    entityType?: string;
    entityId?: string;
  }): Promise<ApprovalRequest> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: CREATE_APPROVAL_REQUEST,
      variables: { input },
    });
    if (result.error) {
      throw new Error(result.error.message || 'Failed to create approval request');
    }
    return result.data!.createApprovalRequest as unknown as ApprovalRequest;
  }

  async reviewApprovalRequest(input: {
    id: string;
    action: 'approved' | 'rejected';
    message?: string;
  }): Promise<ApprovalRequest> {
    const client = this.apolloService.getClient();
    const result = await client.mutate({
      mutation: REVIEW_APPROVAL_REQUEST,
      variables: { input },
    });
    if (result.error) {
      throw new Error(result.error.message || 'Failed to review approval request');
    }
    return result.data!.reviewApprovalRequest as unknown as ApprovalRequest;
  }
}
