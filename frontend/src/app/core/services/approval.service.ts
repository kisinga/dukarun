import { Injectable, inject, signal } from '@angular/core';
import { ApolloService } from './apollo.service';
import {
  GetApprovalRequestsDocument,
  GetApprovalRequestDocument,
  GetMyApprovalRequestsDocument,
  CreateApprovalRequestDocument,
  ReviewApprovalRequestDocument,
  type GetApprovalRequestsQuery,
  type GetApprovalRequestQuery,
  type GetMyApprovalRequestsQuery,
  type CreateApprovalRequestMutation,
  type ReviewApprovalRequestMutation,
} from '../graphql/generated/graphql';

export interface ApprovalRequest {
  id: string;
  channelId: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  dueAt: string | null;
  requestedById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  message: string | null;
  rejectionReasonCode: string | null;
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
    const result = await client.query<GetApprovalRequestsQuery>({
      query: GetApprovalRequestsDocument,
      variables: { options: options ?? {} },
      fetchPolicy: 'network-only',
    });
    const data = result.data?.getApprovalRequests;
    return data
      ? { items: data.items as ApprovalRequest[], totalItems: data.totalItems }
      : { items: [], totalItems: 0 };
  }

  async getApproval(id: string): Promise<ApprovalRequest | null> {
    const client = this.apolloService.getClient();
    const result = await client.query<GetApprovalRequestQuery>({
      query: GetApprovalRequestDocument,
      variables: { id },
      fetchPolicy: 'network-only',
    });
    const data = result.data?.getApprovalRequest;
    return data ? (data as ApprovalRequest) : null;
  }

  async getMyApprovalRequests(options?: {
    skip?: number;
    take?: number;
    status?: string;
    type?: string;
  }): Promise<ApprovalRequestList> {
    const client = this.apolloService.getClient();
    const result = await client.query<GetMyApprovalRequestsQuery>({
      query: GetMyApprovalRequestsDocument,
      variables: { options: options ?? {} },
      fetchPolicy: 'network-only',
    });
    const data = result.data?.getMyApprovalRequests;
    return data
      ? { items: data.items as ApprovalRequest[], totalItems: data.totalItems }
      : { items: [], totalItems: 0 };
  }

  async createApprovalRequest(input: {
    type: string;
    metadata?: Record<string, any>;
    entityType?: string;
    entityId?: string;
    dueAt?: string;
  }): Promise<ApprovalRequest> {
    const client = this.apolloService.getClient();
    const result = await client.mutate<CreateApprovalRequestMutation>({
      mutation: CreateApprovalRequestDocument,
      variables: { input },
    });
    if (result.error) {
      throw new Error(result.error.message || 'Failed to create approval request');
    }
    const data = result.data?.createApprovalRequest;
    if (!data) throw new Error('No data returned from createApprovalRequest');
    return data as ApprovalRequest;
  }

  async reviewApprovalRequest(input: {
    id: string;
    action: 'approved' | 'rejected';
    message?: string;
    rejectionReasonCode?: string;
  }): Promise<ApprovalRequest> {
    const client = this.apolloService.getClient();
    const result = await client.mutate<ReviewApprovalRequestMutation>({
      mutation: ReviewApprovalRequestDocument,
      variables: { input },
    });
    if (result.error) {
      throw new Error(result.error.message || 'Failed to review approval request');
    }
    const data = result.data?.reviewApprovalRequest;
    if (!data) throw new Error('No data returned from reviewApprovalRequest');
    return data as ApprovalRequest;
  }
}
