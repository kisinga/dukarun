import { BadRequestException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { gql } from 'graphql-tag';

import { ChannelSettingsService } from '../../services/channels/channel-settings.service';
import {
  ChannelAdminService,
  CreateChannelAdminInput,
  InviteAdministratorInput,
  UpdateChannelAdminInput,
} from '../../services/channels/channel-admin.service';
import { ChannelPaymentService } from '../../services/channels/channel-payment.service';

export const channelSettingsSchema = gql`
  extend type Query {
    roleTemplates: [RoleTemplate!]!
  }

  extend type Mutation {
    updateChannelLogo(logoAssetId: ID): ChannelSettings!
    updateCashierSettings(cashierFlowEnabled: Boolean): ChannelSettings!
    updatePrinterSettings(enablePrinter: Boolean!): ChannelSettings!
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
    enablePrinter: Boolean!
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
  constructor(
    private readonly channelSettingsService: ChannelSettingsService,
    private readonly channelAdminService: ChannelAdminService,
    private readonly channelPaymentService: ChannelPaymentService
  ) {}

  @Query()
  @Allow(Permission.ReadSettings)
  async roleTemplates(@Ctx() ctx: RequestContext) {
    const templates = await this.channelAdminService.getRoleTemplates(ctx);
    return templates.map(template => ({
      code: template.code,
      name: template.name,
      description: template.description ?? '',
      permissions: template.permissions ?? [],
    }));
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updateChannelLogo(
    @Ctx() ctx: RequestContext,
    @Args('logoAssetId', { nullable: true }) logoAssetId?: string
  ) {
    return this.channelSettingsService.updateChannelLogo(ctx, logoAssetId);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updateCashierSettings(
    @Ctx() ctx: RequestContext,
    @Args('cashierFlowEnabled', { nullable: true }) cashierFlowEnabled?: boolean
  ) {
    return this.channelSettingsService.updateCashierSettings(ctx, cashierFlowEnabled);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updatePrinterSettings(
    @Ctx() ctx: RequestContext,
    @Args('enablePrinter') enablePrinter: boolean
  ) {
    return this.channelSettingsService.updatePrinterSettings(ctx, enablePrinter);
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
  @Allow(Permission.UpdateSettings)
  async inviteChannelAdministrator(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    if (ctx.channelId == null) {
      throw new BadRequestException('Channel context is required');
    }
    return this.channelAdminService.inviteChannelAdministrator(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async createChannelAdmin(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateChannelAdminInput
  ) {
    if (ctx.channelId == null) {
      throw new BadRequestException('Channel context is required');
    }
    return this.channelAdminService.inviteChannelAdministrator(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updateChannelAdmin(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string,
    @Args('permissions', { type: () => [String] }) permissions: string[]
  ) {
    if (ctx.channelId == null) {
      throw new BadRequestException('Channel context is required');
    }
    return this.channelAdminService.updateChannelAdministrator(ctx, {
      id,
      permissions: permissions as Permission[],
    });
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async disableChannelAdmin(@Ctx() ctx: RequestContext, @Args('id') id: string) {
    if (ctx.channelId == null) {
      throw new BadRequestException('Channel context is required');
    }
    return this.channelAdminService.disableChannelAdministrator(ctx, id);
  }

  @Mutation()
  @Allow(Permission.CreatePaymentMethod)
  async createChannelPaymentMethod(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    return this.channelPaymentService.createChannelPaymentMethod(ctx, input);
  }

  @Mutation()
  @Allow(Permission.UpdatePaymentMethod)
  async updateChannelPaymentMethod(@Ctx() ctx: RequestContext, @Args('input') input: any) {
    return this.channelPaymentService.updateChannelPaymentMethod(ctx, input);
  }
}
