import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  PermissionDefinition,
  PluginCommonModule,
  RequestContext,
  VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { ApprovalRequest } from '../../domain/approval/approval-request.entity';
import {
  ApprovalService,
  CreateApprovalRequestInput,
  ReviewApprovalRequestInput,
} from '../../services/approval/approval.service';

// Custom permission for reviewing approval requests
export const ManageApprovalsPermission = new PermissionDefinition({
  name: 'ManageApprovals',
  description: 'Allows reviewing (approving/rejecting) approval requests',
});

const approvalSchema = gql`
  type ApprovalRequest {
    id: ID!
    channelId: ID!
    type: String!
    status: String!
    requestedById: ID!
    reviewedById: ID
    reviewedAt: DateTime
    message: String
    metadata: JSON
    entityType: String
    entityId: String
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ApprovalRequestList {
    items: [ApprovalRequest!]!
    totalItems: Int!
  }

  input CreateApprovalRequestInput {
    type: String!
    metadata: JSON
    entityType: String
    entityId: String
  }

  input ReviewApprovalRequestInput {
    id: ID!
    action: String!
    message: String
  }

  input ApprovalRequestListOptions {
    skip: Int
    take: Int
    status: String
    type: String
  }

  extend type Query {
    getApprovalRequests(options: ApprovalRequestListOptions): ApprovalRequestList!
    getApprovalRequest(id: ID!): ApprovalRequest
    getMyApprovalRequests(options: ApprovalRequestListOptions): ApprovalRequestList!
  }

  extend type Mutation {
    createApprovalRequest(input: CreateApprovalRequestInput!): ApprovalRequest!
    reviewApprovalRequest(input: ReviewApprovalRequestInput!): ApprovalRequest!
  }
`;

@Resolver()
class ApprovalResolver {
  constructor(private readonly approvalService: ApprovalService) {}

  @Query()
  async getApprovalRequests(@Ctx() ctx: RequestContext, @Args('options') options: any = {}) {
    return this.approvalService.getApprovalRequests(ctx, options);
  }

  @Query()
  async getApprovalRequest(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    return this.approvalService.getApprovalRequest(ctx, id);
  }

  @Query()
  async getMyApprovalRequests(@Ctx() ctx: RequestContext, @Args('options') options: any = {}) {
    return this.approvalService.getMyApprovalRequests(ctx, options);
  }

  @Mutation()
  async createApprovalRequest(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateApprovalRequestInput
  ) {
    return this.approvalService.createApprovalRequest(ctx, input);
  }

  @Mutation()
  @Allow(ManageApprovalsPermission.Permission)
  async reviewApprovalRequest(
    @Ctx() ctx: RequestContext,
    @Args('input') input: ReviewApprovalRequestInput
  ) {
    return this.approvalService.reviewApprovalRequest(ctx, input);
  }
}

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [ApprovalRequest],
  providers: [ApprovalService, ApprovalResolver],
  exports: [ApprovalService],
  adminApiExtensions: {
    resolvers: [ApprovalResolver],
    schema: approvalSchema,
  },
  configuration: config => {
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions || []),
      ManageApprovalsPermission,
    ];
    return config;
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class ApprovalPlugin {}
