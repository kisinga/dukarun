import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { gql } from 'graphql-tag';

import {
  ChannelSettingsService,
  UpdateChannelSettingsInput,
  CreateChannelAdminInput,
  UpdateChannelAdminInput,
} from '../../services/channels/channel-settings.service';

export const channelSettingsSchema = gql`
  extend type Query {
    roleTemplates: [RoleTemplate!]!
  }

  extend type Mutation {
    updateChannelSettings(input: UpdateChannelSettingsInput!): ChannelSettings!
    updateChannelStatus(channelId: ID!, status: String!): Channel!
    inviteChannelAdministrator(input: InviteAdministratorInput!): Administrator!
    createChannelAdmin(input: CreateChannelAdminInput!): Administrator!
    updateChannelAdmin(id: ID!, permissions: [String!]!): Administrator!
    disableChannelAdmin(id: ID!): DisableChannelAdminResponse!
    createChannelPaymentMethod(input: CreatePaymentMethodInput!): PaymentMethod!
    updateChannelPaymentMethod(input: UpdatePaymentMethodInput!): PaymentMethod!
  }

  type ChannelSettings {
    cashierFlowEnabled: Boolean!
    cashierOpen: Boolean!
    companyLogoAsset: Asset
  }

  type RoleTemplate {
    code: String!
    name: String!
    description: String!
    permissions: [String!]!
  }

  type DisableChannelAdminResponse {
    success: Boolean!
    message: String!
  }

  input UpdateChannelSettingsInput {
    cashierFlowEnabled: Boolean
    cashierOpen: Boolean
    companyLogoAssetId: ID
  }

  input InviteAdministratorInput {
    emailAddress: String
    phoneNumber: String!
    firstName: String!
    lastName: String!
    roleTemplateCode: String
    permissionOverrides: [String!]
  }

  input CreateChannelAdminInput {
    firstName: String!
    lastName: String!
    phoneNumber: String!
    emailAddress: String
    roleTemplateCode: String!
    permissionOverrides: [String!]
  }
`;

@Resolver()
export class ChannelSettingsResolver {
  constructor(private readonly channelSettingsService: ChannelSettingsService) {}

  @Query()
  @Allow(Permission.ReadSettings)
  async roleTemplates(@Ctx() ctx: RequestContext) {
    const templates = this.channelSettingsService.getRoleTemplates();
    return templates.map(template => ({
      code: template.code,
      name: template.name,
      description: template.description,
      permissions: template.permissions,
    }));
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updateChannelSettings(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateChannelSettingsInput
  ) {
    return this.channelSettingsService.updateChannelSettings(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updateChannelStatus(
    @Ctx() ctx: RequestContext,
    @Args('channelId') channelId: string,
    @Args('status') status: string
  ) {
    const validStatuses = ['UNAPPROVED', 'APPROVED', 'DISABLED', 'BANNED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }
    return this.channelSettingsService.updateChannelStatus(
      ctx,
      channelId,
      status as 'UNAPPROVED' | 'APPROVED' | 'DISABLED' | 'BANNED'
    );
  }

  @Mutation()
  @Allow(Permission.CreateAdministrator)
  async inviteChannelAdministrator(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    return this.channelSettingsService.inviteChannelAdministrator(ctx, input);
  }

  @Mutation()
  @Allow(Permission.CreateAdministrator)
  async createChannelAdmin(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateChannelAdminInput
  ) {
    return this.channelSettingsService.inviteChannelAdministrator(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateAdministrator)
  async updateChannelAdmin(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string,
    @Args('permissions', { type: () => [String] }) permissions: string[]
  ) {
    return this.channelSettingsService.updateChannelAdministrator(ctx, {
      id,
      permissions: permissions as Permission[],
    });
  }

  @Mutation()
  @Allow(Permission.DeleteAdministrator)
  async disableChannelAdmin(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    return this.channelSettingsService.disableChannelAdministrator(ctx, id);
  }

  @Mutation()
  @Allow(Permission.CreatePaymentMethod)
  async createChannelPaymentMethod(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    return this.channelSettingsService.createChannelPaymentMethod(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdatePaymentMethod)
  async updateChannelPaymentMethod(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    return this.channelSettingsService.updateChannelPaymentMethod(ctx, input);
  }
}
