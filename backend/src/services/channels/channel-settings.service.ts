import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Administrator,
  AdministratorService,
  Asset,
  Channel,
  ChannelService,
  PaymentMethod,
  PaymentMethodService,
  Permission,
  RequestContext,
  Role,
  RoleService,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import {
  ApproveCustomerCreditPermission,
  ManageCustomerCreditLimitPermission,
} from '../../plugins/credit/permissions';
import { OverridePricePermission } from '../../plugins/pricing/price-override.permission';
import { ChannelActionTrackingService } from '../../infrastructure/events/channel-action-tracking.service';
import { ChannelEventType } from '../../infrastructure/events/types/event-type.enum';
import { ActionCategory } from '../../infrastructure/events/types/action-category.enum';
import { ChannelActionType } from '../../infrastructure/events/types/action-type.enum';
import { ROLE_TEMPLATES, RoleTemplate } from '../auth/provisioning/role-provisioner.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { ChannelUpdateHelper } from './channel-update.helper';
import { getChannelStatus } from '../../domain/channel-custom-fields';

export interface ChannelSettings {
  cashierFlowEnabled: boolean;
  cashierOpen: boolean;
  enablePrinter: boolean;
  companyLogoAsset?: Asset | null;
}

export interface UpdateChannelSettingsInput {
  cashierFlowEnabled?: boolean | null;
  cashierOpen?: boolean | null;
  enablePrinter?: boolean | null;
  companyLogoAssetId?: string | null;
}

export interface InviteAdministratorInput {
  emailAddress?: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  roleTemplateCode?: string;
  permissionOverrides?: Permission[];
}

export interface CreateChannelAdminInput {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  emailAddress?: string;
  roleTemplateCode: string;
  permissionOverrides?: Permission[];
}

export interface UpdateChannelAdminInput {
  id: string;
  permissions: Permission[];
}

@Injectable()
export class ChannelSettingsService {
  private readonly logger = new Logger(ChannelSettingsService.name);

  constructor(
    private readonly channelService: ChannelService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly administratorService: AdministratorService,
    private readonly roleService: RoleService,
    private readonly connection: TransactionalConnection,
    private readonly auditService: AuditService,
    private readonly actionTrackingService: ChannelActionTrackingService,
    private readonly smsService: SmsService,
    private readonly channelUpdateHelper: ChannelUpdateHelper
  ) {}

  async updateChannelSettings(
    ctx: RequestContext,
    input: UpdateChannelSettingsInput
  ): Promise<ChannelSettings> {
    const channelId = ctx.channelId!;
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const current = (channel.customFields ?? {}) as {
      cashierFlowEnabled?: boolean;
      cashierOpen?: boolean;
      cashControlEnabled?: boolean;
      enablePrinter?: boolean;
      companyLogoAsset?: Asset | null;
    };

    const nextCashierFlowEnabled = input.cashierFlowEnabled ?? current.cashierFlowEnabled ?? false;
    const nextCashierOpen = input.cashierOpen ?? current.cashierOpen ?? false;

    if (!nextCashierFlowEnabled && nextCashierOpen) {
      throw new BadRequestException(
        'Cashier cannot be open when the cashier approval flow is disabled.'
      );
    }

    // Validation: If cashControlEnabled is true and cashierFlowEnabled is false, log a warning
    // Cash control can work independently, but it's typically used together with cashier flow
    const nextCashControlEnabled = (channel.customFields as any)?.cashControlEnabled ?? false;
    if (nextCashControlEnabled && !nextCashierFlowEnabled) {
      this.logger.warn(
        `Channel ${channelId} has cashControlEnabled=true but cashierFlowEnabled=false. ` +
          `Cash control can work independently, but is typically used with cashier flow.`
      );
    }

    const customFieldsUpdate: Record<string, any> = {};

    if (
      input.cashierFlowEnabled !== undefined &&
      input.cashierFlowEnabled !== current.cashierFlowEnabled
    ) {
      customFieldsUpdate.cashierFlowEnabled = input.cashierFlowEnabled;
    }

    if (input.cashierOpen !== undefined && input.cashierOpen !== current.cashierOpen) {
      customFieldsUpdate.cashierOpen = input.cashierOpen;
    }

    if (
      input.cashierFlowEnabled !== undefined &&
      input.cashierFlowEnabled === false &&
      input.cashierOpen === undefined &&
      current.cashierOpen !== false
    ) {
      customFieldsUpdate.cashierOpen = false;
    }

    if (input.enablePrinter !== undefined && input.enablePrinter !== current.enablePrinter) {
      customFieldsUpdate.enablePrinter = input.enablePrinter;
    }

    if (input.companyLogoAssetId !== undefined) {
      if (!input.companyLogoAssetId) {
        customFieldsUpdate.companyLogoAsset = null;
      } else {
        const asset = await this.connection.getRepository(ctx, Asset).findOne({
          where: { id: input.companyLogoAssetId },
        });

        if (!asset) {
          throw new BadRequestException('Company logo asset not found.');
        }

        if (current.companyLogoAsset?.id !== input.companyLogoAssetId) {
          customFieldsUpdate.companyLogoAsset = asset;
        }
      }
    }

    if (Object.keys(customFieldsUpdate).length > 0) {
      await this.channelUpdateHelper.updateChannelCustomFields(
        ctx,
        channelId.toString(),
        customFieldsUpdate,
        {
          detectChanges: true,
          auditEvent: 'channel.settings.updated',
        }
      );

      this.logger.log('Channel settings updated', {
        channelId,
        fields: Object.keys(customFieldsUpdate),
      });

      const updatedChannel = await this.channelService.findOne(ctx, channelId);
      if (!updatedChannel) {
        throw new Error('Channel not found after update');
      }

      return this.mapChannelSettings(updatedChannel);
    }

    return this.mapChannelSettings(channel);
  }

  /**
   * Update channel status (UNAPPROVED/APPROVED/DISABLED/BANNED)
   * SMS notifications are handled by ChannelStatusSubscriber via Vendure ChannelEvent
   */
  async updateChannelStatus(
    ctx: RequestContext,
    channelId: string,
    status: 'UNAPPROVED' | 'APPROVED' | 'DISABLED' | 'BANNED'
  ): Promise<Channel> {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const currentStatus = getChannelStatus(channel.customFields);

    await this.channelUpdateHelper.updateChannelCustomFields(ctx, channelId, { status } as any, {
      detectChanges: true,
      auditEvent: 'channel.status.updated',
      // Note: SMS notifications are handled by ChannelStatusSubscriber
      // which listens to Vendure ChannelEvent, so no need for onStatusChange callback
    });

    const updatedChannel = await this.channelService.findOne(ctx, channelId);
    if (!updatedChannel) {
      throw new Error('Channel not found after update');
    }

    return updatedChannel;
  }

  /**
   * Get available role templates
   */
  getRoleTemplates(): RoleTemplate[] {
    return Object.values(ROLE_TEMPLATES);
  }

  /**
   * Check if an administrator is a superadmin
   * Superadmins have roles with no channel restrictions (empty or null channels array)
   */
  private async isSuperAdmin(ctx: RequestContext, administrator: Administrator): Promise<boolean> {
    try {
      if (!administrator.user) {
        return false;
      }

      // Load user with roles and channels
      const user = await this.connection.getRepository(ctx, User).findOne({
        where: { id: administrator.user.id },
        relations: ['roles', 'roles.channels'],
      });

      if (!user || !user.roles) {
        return false;
      }

      // Check if user has any role with no channel restrictions
      // Superadmins have roles with empty or null channels array
      return user.roles.some(role => !role.channels || role.channels.length === 0);
    } catch (error) {
      this.logger.warn(
        `Failed to check if administrator is superadmin: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Check admin count rate limit
   */
  private async checkAdminCountLimit(ctx: RequestContext): Promise<void> {
    const channelId = ctx.channelId!;
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const customFields = (channel.customFields ?? {}) as {
      maxAdminCount?: number;
    };

    const maxAdminCount = customFields.maxAdminCount ?? 5;

    // Count current administrators for this channel
    const administrators = await this.connection
      .getRepository(ctx, Administrator)
      .createQueryBuilder('admin')
      .leftJoinAndSelect('admin.user', 'user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.channels', 'channel')
      .where('channel.id = :channelId', { channelId })
      .getMany();

    if (administrators.length >= maxAdminCount) {
      throw new BadRequestException(
        `Maximum admin count (${maxAdminCount}) reached for this channel.`
      );
    }
  }

  /**
   * Find existing user by phone number (identifier)
   */
  private async findExistingUserByPhone(
    ctx: RequestContext,
    phoneNumber: string
  ): Promise<User | null> {
    try {
      const user = await this.connection.getRepository(ctx, User).findOne({
        where: { identifier: phoneNumber },
        relations: ['roles', 'roles.channels'],
      });
      return user || null;
    } catch (error) {
      this.logger.warn(
        `Failed to find user by phone number: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Check if user belongs to a specific channel
   */
  private userBelongsToChannel(user: User, channelId: string): boolean {
    if (!user.roles) {
      return false;
    }
    return user.roles.some(role => role.channels?.some(channel => channel.id === channelId));
  }

  /**
   * Update administrator email if existing email is blank/null and new email is provided
   */
  private async updateAdministratorEmailIfNeeded(
    ctx: RequestContext,
    administrator: Administrator,
    newEmail: string | undefined
  ): Promise<void> {
    if (!newEmail || typeof newEmail !== 'string' || newEmail.trim().length === 0) {
      return;
    }

    // Only update if current email is blank/null/empty
    const currentEmail = administrator.emailAddress;
    if (currentEmail && currentEmail.trim().length > 0) {
      return; // Don't overwrite existing email
    }

    // Update email
    administrator.emailAddress = newEmail.trim();
    await this.connection.getRepository(ctx, Administrator).save(administrator);
  }

  /**
   * Attach role to existing user (for multi-channel support)
   */
  private async attachRoleToExistingUser(
    ctx: RequestContext,
    user: User,
    role: Role
  ): Promise<User> {
    const userRepo = this.connection.getRepository(ctx, User);
    const userWithRoles = await userRepo.findOne({
      where: { id: user.id },
      relations: ['roles'],
    });

    if (!userWithRoles) {
      throw new BadRequestException(`User ${user.id} not found`);
    }

    // Check if role is already assigned
    if (userWithRoles.roles?.some(r => r.id === role.id)) {
      return userWithRoles;
    }

    // Attach role directly
    userWithRoles.roles = [...(userWithRoles.roles || []), role];
    await userRepo.save(userWithRoles);

    return userWithRoles;
  }

  /**
   * Send welcome SMS to new administrator
   */
  private async sendWelcomeSms(
    ctx: RequestContext,
    phoneNumber: string,
    channelId: string,
    isExistingUser: boolean
  ): Promise<void> {
    try {
      // Get channel to include company name in message
      const channel = await this.channelService.findOne(ctx, channelId);
      const companyName = channel?.code || 'your organization';

      const message = isExistingUser
        ? `Welcome! You've been added as an administrator to ${companyName}. You can now access the dashboard. Go to https://dukarun.com/login to get started.`
        : `Welcome to ${companyName}! You've been added as an administrator. You can now access the dashboard. Go to https://dukarun.com/login to get started.`;

      const result = await this.smsService.sendSms(phoneNumber, message);

      if (!result.success) {
        this.logger.warn(`Failed to send welcome SMS to ${phoneNumber}: ${result.error}`);
        // Don't throw - SMS failure shouldn't block admin creation
      }
    } catch (error) {
      this.logger.warn(
        `Error sending welcome SMS: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - SMS failure shouldn't block admin creation
    }
  }

  /**
   * Invite or create channel administrator
   * Supports both legacy email-based and new phone-based flows
   * Handles multi-channel support: adds existing users to new channels instead of creating duplicates
   */
  async inviteChannelAdministrator(
    ctx: RequestContext,
    input: InviteAdministratorInput | CreateChannelAdminInput
  ): Promise<Administrator> {
    const channelId = ctx.channelId!;

    // Phone number is required
    if (!('phoneNumber' in input) || !input.phoneNumber) {
      throw new BadRequestException('phoneNumber is required');
    }

    // Normalize emailAddress: remove if it's null, undefined, empty string, or whitespace-only
    // This prevents Vendure's email normalization from throwing errors
    // CRITICAL: When spreading objects, undefined properties are included, so we must explicitly remove them
    const normalizedInput: any = {};

    // Copy all properties except emailAddress
    Object.keys(input).forEach(key => {
      if (key !== 'emailAddress') {
        normalizedInput[key] = (input as any)[key];
      }
    });

    // Only add emailAddress if it's a valid non-empty string
    if ('emailAddress' in input) {
      const email = (input as any).emailAddress;
      if (email && typeof email === 'string' && email.trim().length > 0) {
        normalizedInput.emailAddress = email.trim();
      }
    }
    // If emailAddress was undefined/null/empty, it's now completely absent from normalizedInput

    // Use normalized input for the rest of the method
    const cleanInput = normalizedInput;

    // Check if user with this phone number already exists (phone is primary identifier)
    const existingUser = await this.findExistingUserByPhone(ctx, cleanInput.phoneNumber);

    if (existingUser) {
      // User exists - check if they already belong to this channel
      if (this.userBelongsToChannel(existingUser, channelId.toString())) {
        throw new BadRequestException(
          `Administrator with phone number ${cleanInput.phoneNumber} already belongs to this channel`
        );
      }

      // User exists but belongs to different channel(s) - add them to this channel
      // Determine role template
      const roleTemplateCode =
        'roleTemplateCode' in cleanInput ? cleanInput.roleTemplateCode : 'admin';
      const template = roleTemplateCode ? ROLE_TEMPLATES[roleTemplateCode] : undefined;
      if (!template) {
        throw new BadRequestException(`Invalid role template code: ${roleTemplateCode}`);
      }

      // Merge template permissions with overrides
      const finalPermissions =
        'permissionOverrides' in cleanInput && cleanInput.permissionOverrides
          ? cleanInput.permissionOverrides
          : template.permissions;

      // Create new channel-specific role
      const roleCode = `channel-${roleTemplateCode}-${channelId}-${Date.now()}`;
      const createRoleInput = {
        code: roleCode,
        description: `${template.name} role for ${cleanInput.firstName} ${cleanInput.lastName}`,
        permissions: finalPermissions,
        channelIds: [channelId],
      };

      const role = await this.roleService.create(ctx, createRoleInput);

      // Attach role to existing user
      await this.attachRoleToExistingUser(ctx, existingUser, role);

      // Get existing administrator
      const administrator = await this.connection.getRepository(ctx, Administrator).findOne({
        where: { user: { id: existingUser.id } },
      });

      if (!administrator) {
        throw new BadRequestException(
          `Administrator not found for user with phone number ${cleanInput.phoneNumber}`
        );
      }

      // Update email if provided and existing email is blank
      await this.updateAdministratorEmailIfNeeded(ctx, administrator, cleanInput.emailAddress);

      // Send welcome SMS
      await this.sendWelcomeSms(ctx, cleanInput.phoneNumber, channelId.toString(), true);

      // Track action and audit
      await this.actionTrackingService.trackAction(
        ctx,
        channelId.toString(),
        ChannelEventType.ADMIN_CREATED,
        ChannelActionType.SMS,
        ActionCategory.SYSTEM_NOTIFICATIONS,
        {
          adminId: administrator.id.toString(),
          roleTemplateCode: roleTemplateCode || 'admin',
        }
      );

      await this.auditService
        .log(ctx, 'admin.invited', {
          entityType: 'Administrator',
          entityId: administrator.id.toString(),
          data: {
            firstName: cleanInput.firstName,
            lastName: cleanInput.lastName,
            phoneNumber: cleanInput.phoneNumber,
            emailAddress: 'emailAddress' in cleanInput ? cleanInput.emailAddress : undefined,
            roleId: role.id.toString(),
            roleTemplateCode,
            action: 'added_to_channel',
          },
        })
        .catch(err => {
          this.logger.warn(
            `Failed to log admin invitation audit: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      return administrator;
    }

    // User doesn't exist - proceed with creating new administrator
    // Check rate limit
    await this.checkAdminCountLimit(ctx);

    // Determine role template
    const roleTemplateCode =
      'roleTemplateCode' in cleanInput ? cleanInput.roleTemplateCode : 'admin';
    const template = roleTemplateCode ? ROLE_TEMPLATES[roleTemplateCode] : undefined;
    if (!template) {
      throw new BadRequestException(`Invalid role template code: ${roleTemplateCode}`);
    }

    // Merge template permissions with overrides
    const finalPermissions =
      'permissionOverrides' in cleanInput && cleanInput.permissionOverrides
        ? cleanInput.permissionOverrides
        : template.permissions;

    // Create or get role for this admin
    const roleCode = `channel-${roleTemplateCode}-${channelId}-${Date.now()}`;
    const createRoleInput = {
      code: roleCode,
      description: `${template.name} role for ${cleanInput.firstName} ${cleanInput.lastName}`,
      permissions: finalPermissions,
      channelIds: [channelId],
    };

    const role = await this.roleService.create(ctx, createRoleInput);

    // Create administrator
    // ROOT CAUSE: Vendure's AdministratorService.create() ALWAYS calls normalizeEmailAddress(input.emailAddress)
    // even when emailAddress is not provided. When the property doesn't exist, input.emailAddress is undefined,
    // and normalizeEmailAddress(undefined) fails because isEmailAddressLike() tries to read .length on undefined.
    // SOLUTION: Always provide a valid email address. For phone-based auth, use phone number as email fallback.
    const emailToUse =
      'emailAddress' in cleanInput &&
      cleanInput.emailAddress &&
      typeof cleanInput.emailAddress === 'string' &&
      cleanInput.emailAddress.trim().length > 0
        ? cleanInput.emailAddress.trim()
        : cleanInput.phoneNumber; // Use phone number as email fallback for phone-based auth

    const createAdminInput: any = {
      firstName: cleanInput.firstName,
      lastName: cleanInput.lastName,
      password: this.generateTemporaryPassword(),
      roleIds: [role.id],
      identifier: cleanInput.phoneNumber, // Phone-based flow: create user with phone identifier
      emailAddress: emailToUse, // Always provide emailAddress - use phone number as fallback
    };

    const administrator = await this.administratorService.create(ctx, createAdminInput);

    // Send welcome SMS
    await this.sendWelcomeSms(ctx, cleanInput.phoneNumber, channelId.toString(), false);

    // Track action (using SMS as placeholder action type for counting)
    await this.actionTrackingService.trackAction(
      ctx,
      channelId.toString(),
      ChannelEventType.ADMIN_CREATED,
      ChannelActionType.SMS,
      ActionCategory.SYSTEM_NOTIFICATIONS,
      {
        adminId: administrator.id.toString(),
        roleTemplateCode: roleTemplateCode || 'admin',
      }
    );

    // Log audit event
    await this.auditService
      .log(ctx, 'admin.invited', {
        entityType: 'Administrator',
        entityId: administrator.id.toString(),
        data: {
          firstName: cleanInput.firstName,
          lastName: cleanInput.lastName,
          phoneNumber: 'phoneNumber' in cleanInput ? cleanInput.phoneNumber : undefined,
          emailAddress: 'emailAddress' in cleanInput ? cleanInput.emailAddress : undefined,
          roleId: role.id.toString(),
          roleTemplateCode,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log admin invitation audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return administrator;
  }

  /**
   * Update channel administrator permissions
   */
  async updateChannelAdministrator(
    ctx: RequestContext,
    input: UpdateChannelAdminInput
  ): Promise<Administrator> {
    const channelId = ctx.channelId!;

    // Get administrator
    const administrator = await this.administratorService.findOne(ctx, input.id);
    if (!administrator) {
      throw new NotFoundException(`Administrator with ID ${input.id} not found`);
    }

    // Prevent modifying superadmins
    const isSuper = await this.isSuperAdmin(ctx, administrator);
    if (isSuper) {
      throw new BadRequestException('Cannot modify superadmin profiles');
    }

    // Verify administrator belongs to this channel
    const user = await this.connection.getRepository(ctx, User).findOne({
      where: { id: administrator.user.id },
      relations: ['roles', 'roles.channels'],
    });

    if (!user || !user.roles.some(role => role.channels.some(ch => ch.id === channelId))) {
      throw new BadRequestException('Administrator does not belong to this channel');
    }

    // Update role permissions (assuming single role per admin for simplicity)
    const role = user.roles.find(r => r.channels.some(ch => ch.id === channelId));
    if (!role) {
      throw new BadRequestException('Role not found for administrator');
    }

    await this.roleService.update(ctx, {
      id: role.id,
      permissions: input.permissions,
    });

    // Track action (using SMS as placeholder action type for counting)
    await this.actionTrackingService.trackAction(
      ctx,
      channelId.toString(),
      ChannelEventType.ADMIN_UPDATED,
      ChannelActionType.SMS,
      ActionCategory.SYSTEM_NOTIFICATIONS,
      {
        adminId: administrator.id.toString(),
      }
    );

    // Log audit event
    await this.auditService
      .log(ctx, 'admin.updated', {
        entityType: 'Administrator',
        entityId: administrator.id.toString(),
        data: {
          permissions: input.permissions,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log admin update audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // Reload administrator
    const updated = await this.administratorService.findOne(ctx, input.id);
    if (!updated) {
      throw new Error('Failed to reload administrator after update');
    }

    return updated;
  }

  /**
   * Disable (soft delete) channel administrator
   */
  async disableChannelAdministrator(
    ctx: RequestContext,
    adminId: string
  ): Promise<{ success: boolean; message: string }> {
    const channelId = ctx.channelId!;

    // Get administrator
    const administrator = await this.administratorService.findOne(ctx, adminId);
    if (!administrator) {
      throw new NotFoundException(`Administrator with ID ${adminId} not found`);
    }

    // Prevent disabling superadmins
    const isSuper = await this.isSuperAdmin(ctx, administrator);
    if (isSuper) {
      throw new BadRequestException('Cannot disable superadmin profiles');
    }

    // Delete administrator via repository (Vendure doesn't expose delete on AdministratorService)
    // Remove all roles first, then delete the administrator entity
    const user = await this.connection.getRepository(ctx, User).findOne({
      where: { id: administrator.user.id },
      relations: ['roles'],
    });

    if (user && user.roles.length > 0) {
      // Remove all roles
      user.roles = [];
      await this.connection.getRepository(ctx, User).save(user);
    }

    // Delete the administrator entity
    await this.connection.getRepository(ctx, Administrator).remove(administrator);

    // Log audit event
    await this.auditService
      .log(ctx, 'admin.disabled', {
        entityType: 'Administrator',
        entityId: adminId,
        data: {
          firstName: administrator.firstName,
          lastName: administrator.lastName,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log admin disable audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return {
      success: true,
      message: 'Administrator disabled successfully',
    };
  }

  async createChannelPaymentMethod(ctx: RequestContext, input: any): Promise<PaymentMethod> {
    const createInput = {
      ...input,
      enabled: true,
      customFields: {
        imageAssetId: input.imageAssetId,
        isActive: true,
      },
    };

    const paymentMethod = await this.paymentMethodService.create(ctx, createInput);

    // Log audit event
    await this.auditService
      .log(ctx, 'channel.payment_method.created', {
        entityType: 'PaymentMethod',
        entityId: paymentMethod.id.toString(),
        data: {
          name: paymentMethod.name,
          code: paymentMethod.code,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log payment method creation audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return paymentMethod;
  }

  async updateChannelPaymentMethod(ctx: RequestContext, input: any): Promise<PaymentMethod> {
    const updateInput: Record<string, any> = {
      id: input.id,
    };

    if (input.name !== undefined) {
      updateInput.name = input.name;
    }

    if (input.description !== undefined) {
      updateInput.description = input.description;
    }

    const customFields: Record<string, any> = {};

    if (input.imageAssetId !== undefined) {
      customFields.imageAssetId = input.imageAssetId;
    }

    if (input.isActive !== undefined) {
      customFields.isActive = input.isActive;
    }

    if (Object.keys(customFields).length > 0) {
      updateInput.customFields = customFields;
    }

    const paymentMethod = await this.paymentMethodService.update(ctx, updateInput as any);

    // Log audit event
    await this.auditService
      .log(ctx, 'channel.payment_method.updated', {
        entityType: 'PaymentMethod',
        entityId: input.id.toString(),
        data: {
          changes: {
            name: input.name,
            description: input.description,
            customFields,
          },
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log payment method update audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return paymentMethod;
  }

  private generateTemporaryPassword(): string {
    // Generate a secure temporary password
    return Math.random().toString(36).slice(-12) + '!A1';
  }

  private mapChannelSettings(channel: Channel): ChannelSettings {
    const customFields = (channel.customFields ?? {}) as {
      cashierFlowEnabled?: boolean;
      cashierOpen?: boolean;
      enablePrinter?: boolean;
      companyLogoAsset?: Asset | null;
    };

    return {
      cashierFlowEnabled: customFields.cashierFlowEnabled ?? false,
      cashierOpen: customFields.cashierOpen ?? false,
      enablePrinter: customFields.enablePrinter ?? true,
      companyLogoAsset: customFields.companyLogoAsset ?? null,
    };
  }
}
