import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Administrator,
  AdministratorService,
  Role,
  RoleService,
  TransactionalConnection,
  User,
  RequestContext,
  Permission,
  ChannelService,
} from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { RoleTemplate } from '../../domain/role-template/role-template.entity';
import { RoleTemplateService } from './role-template.service';

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
  roleTemplateCode: string; // Made required as per CreateChannelAdminInput usage
  permissionOverrides?: Permission[];
}

export interface UpdateChannelAdminInput {
  id: string;
  permissions: Permission[];
}

@Injectable()
export class ChannelAdminService {
  private readonly logger = new Logger(ChannelAdminService.name);

  constructor(
    private readonly administratorService: AdministratorService,
    private readonly roleService: RoleService,
    private readonly connection: TransactionalConnection,
    private readonly auditService: AuditService,
    private readonly communicationService: CommunicationService,
    private readonly channelService: ChannelService,
    private readonly roleTemplateService: RoleTemplateService
  ) {}

  /**
   * Get available role templates (from DB). Resolver uses RoleTemplateService.getAllTemplates directly.
   */
  async getRoleTemplates(ctx: RequestContext): Promise<RoleTemplate[]> {
    return this.roleTemplateService.getAllTemplates(ctx);
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

    // Normalize emailAddress
    const normalizedInput: any = {};
    Object.keys(input).forEach(key => {
      if (key !== 'emailAddress') {
        normalizedInput[key] = (input as any)[key];
      }
    });

    if ('emailAddress' in input) {
      const email = (input as any).emailAddress;
      if (email && typeof email === 'string' && email.trim().length > 0) {
        normalizedInput.emailAddress = email.trim();
      }
    }

    const cleanInput = normalizedInput;

    const existingUser = await this.findExistingUserByPhone(ctx, cleanInput.phoneNumber);

    if (existingUser) {
      // User exists - check if they already belong to this channel
      if (this.userBelongsToChannel(existingUser, channelId.toString())) {
        throw new BadRequestException(
          `Administrator with phone number ${cleanInput.phoneNumber} already belongs to this channel`
        );
      }

      await this.checkAdminCountLimit(ctx);

      const roleTemplateCode =
        'roleTemplateCode' in cleanInput ? cleanInput.roleTemplateCode : 'admin';
      const template = await this.roleTemplateService.getTemplateByCode(ctx, roleTemplateCode);
      if (!template) {
        throw new BadRequestException(`Invalid role template code: ${roleTemplateCode}`);
      }

      const hasOverrides =
        'permissionOverrides' in cleanInput &&
        Array.isArray(cleanInput.permissionOverrides) &&
        cleanInput.permissionOverrides.length > 0;
      const finalPermissions = hasOverrides
        ? (cleanInput.permissionOverrides as string[])
        : template.permissions;

      let role: Role;
      if (!hasOverrides) {
        const existingRole = await this.roleTemplateService.findRoleByChannelAndTemplateId(
          ctx,
          channelId,
          template.id
        );
        if (existingRole) {
          role = existingRole;
        } else {
          role = await this.createRoleForTemplate(ctx, channelId, template, cleanInput);
          await this.roleTemplateService.assignTemplateToRole(ctx, role.id as number, template.id);
        }
      } else {
        role = await this.createRoleWithOverrides(
          ctx,
          channelId,
          template,
          finalPermissions,
          cleanInput
        );
      }

      await this.attachRoleToExistingUser(ctx, existingUser, role);

      const administrator = await this.connection.getRepository(ctx, Administrator).findOne({
        where: { user: { id: existingUser.id } },
      });

      if (!administrator) {
        throw new BadRequestException(
          `Administrator not found for user with phone number ${cleanInput.phoneNumber}`
        );
      }

      await this.updateAdministratorEmailIfNeeded(ctx, administrator, cleanInput.emailAddress);
      await this.sendWelcomeSms(ctx, cleanInput.phoneNumber, channelId.toString(), true);

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
    await this.checkAdminCountLimit(ctx);

    const roleTemplateCode =
      'roleTemplateCode' in cleanInput ? cleanInput.roleTemplateCode : 'admin';
    const template = await this.roleTemplateService.getTemplateByCode(ctx, roleTemplateCode);
    if (!template) {
      throw new BadRequestException(`Invalid role template code: ${roleTemplateCode}`);
    }

    const hasOverrides =
      'permissionOverrides' in cleanInput &&
      Array.isArray(cleanInput.permissionOverrides) &&
      cleanInput.permissionOverrides.length > 0;
    const finalPermissions = hasOverrides
      ? (cleanInput.permissionOverrides as string[])
      : template.permissions;

    let role: Role;
    if (!hasOverrides) {
      const existingRole = await this.roleTemplateService.findRoleByChannelAndTemplateId(
        ctx,
        channelId,
        template.id
      );
      if (existingRole) {
        role = existingRole;
      } else {
        role = await this.createRoleForTemplate(ctx, channelId, template, cleanInput);
        await this.roleTemplateService.assignTemplateToRole(ctx, role.id as number, template.id);
      }
    } else {
      role = await this.createRoleWithOverrides(
        ctx,
        channelId,
        template,
        finalPermissions,
        cleanInput
      );
    }

    const emailToUse =
      'emailAddress' in cleanInput &&
      cleanInput.emailAddress &&
      typeof cleanInput.emailAddress === 'string' &&
      cleanInput.emailAddress.trim().length > 0
        ? cleanInput.emailAddress.trim()
        : cleanInput.phoneNumber;

    const createAdminInput: any = {
      firstName: cleanInput.firstName,
      lastName: cleanInput.lastName,
      password: this.generateTemporaryPassword(),
      roleIds: [role.id],
      identifier: cleanInput.phoneNumber,
      emailAddress: emailToUse,
    };

    const administrator = await this.administratorService.create(ctx, createAdminInput);

    await this.sendWelcomeSms(ctx, cleanInput.phoneNumber, channelId.toString(), false);

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

    const administrator = await this.administratorService.findOne(ctx, input.id);
    if (!administrator) {
      throw new NotFoundException(`Administrator with ID ${input.id} not found`);
    }

    const isSuper = await this.isSuperAdmin(ctx, administrator);
    if (isSuper) {
      throw new BadRequestException('Cannot modify superadmin profiles');
    }

    const user = await this.connection.getRepository(ctx, User).findOne({
      where: { id: administrator.user.id },
      relations: ['roles', 'roles.channels'],
    });

    if (!user || !user.roles.some(role => role.channels.some(ch => ch.id === channelId))) {
      throw new BadRequestException('Administrator does not belong to this channel');
    }

    const role = user.roles.find(r => r.channels.some(ch => ch.id === channelId));
    if (!role) {
      throw new BadRequestException('Role not found for administrator');
    }

    await this.roleService.update(ctx, {
      id: role.id,
      permissions: input.permissions,
    });

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

    const administrator = await this.administratorService.findOne(ctx, adminId);
    if (!administrator) {
      throw new NotFoundException(`Administrator with ID ${adminId} not found`);
    }

    const isSuper = await this.isSuperAdmin(ctx, administrator);
    if (isSuper) {
      throw new BadRequestException('Cannot disable superadmin profiles');
    }

    const user = await this.connection.getRepository(ctx, User).findOne({
      where: { id: administrator.user.id },
      relations: ['roles'],
    });

    if (user && user.roles.length > 0) {
      user.roles = [];
      await this.connection.getRepository(ctx, User).save(user);
    }

    await this.connection.getRepository(ctx, Administrator).remove(administrator);

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

  private async isSuperAdmin(ctx: RequestContext, administrator: Administrator): Promise<boolean> {
    try {
      if (!administrator.user) {
        return false;
      }

      const user = await this.connection.getRepository(ctx, User).findOne({
        where: { id: administrator.user.id },
        relations: ['roles', 'roles.channels'],
      });

      if (!user || !user.roles) {
        return false;
      }

      return user.roles.some(role => !role.channels || role.channels.length === 0);
    } catch (error) {
      this.logger.warn(
        `Failed to check if administrator is superadmin: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Create a new role from a template (no overrides). Caller assigns template to role after.
   */
  private async createRoleForTemplate(
    ctx: RequestContext,
    channelId: string | number,
    template: RoleTemplate,
    cleanInput: { firstName: string; lastName: string }
  ): Promise<Role> {
    const roleCode = `channel-${channelId}-${template.id}`;
    return this.roleService.create(ctx, {
      code: roleCode,
      description: `${template.name} role for ${cleanInput.firstName} ${cleanInput.lastName}`,
      permissions: template.permissions as Permission[],
      channelIds: [channelId],
    });
  }

  /**
   * Create a custom role with overridden permissions. No template assignment.
   */
  private async createRoleWithOverrides(
    ctx: RequestContext,
    channelId: string | number,
    template: RoleTemplate,
    permissions: string[],
    cleanInput: { firstName: string; lastName: string }
  ): Promise<Role> {
    const roleCode = `channel-${channelId}-${template.code}-custom-${Date.now()}`;
    return this.roleService.create(ctx, {
      code: roleCode,
      description: `${template.name} role (custom) for ${cleanInput.firstName} ${cleanInput.lastName}`,
      permissions: permissions as Permission[],
      channelIds: [channelId],
    });
  }

  /**
   * Count distinct administrators for the channel (one row per admin, not per role).
   */
  private async getChannelAdminCount(
    ctx: RequestContext,
    channelId: string | number
  ): Promise<number> {
    const result = await this.connection
      .getRepository(ctx, Administrator)
      .createQueryBuilder('admin')
      .innerJoin('admin.user', 'user')
      .innerJoin('user.roles', 'role')
      .innerJoin('role.channels', 'channel')
      .where('channel.id = :channelId', { channelId })
      .select('DISTINCT admin.id')
      .getRawMany<{ admin_id: number }>();
    return result.length;
  }

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
    const count = await this.getChannelAdminCount(ctx, channelId);

    if (count >= maxAdminCount) {
      throw new BadRequestException(
        `Maximum admin count (${maxAdminCount}) reached for this channel.`
      );
    }
  }

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

  private userBelongsToChannel(user: User, channelId: string): boolean {
    if (!user.roles) {
      return false;
    }
    return user.roles.some(role => role.channels?.some(channel => channel.id === channelId));
  }

  private async updateAdministratorEmailIfNeeded(
    ctx: RequestContext,
    administrator: Administrator,
    newEmail: string | undefined
  ): Promise<void> {
    if (!newEmail || typeof newEmail !== 'string' || newEmail.trim().length === 0) {
      return;
    }

    const currentEmail = administrator.emailAddress;
    if (currentEmail && currentEmail.trim().length > 0) {
      return;
    }

    administrator.emailAddress = newEmail.trim();
    await this.connection.getRepository(ctx, Administrator).save(administrator);
  }

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

    if (userWithRoles.roles?.some(r => r.id === role.id)) {
      return userWithRoles;
    }

    userWithRoles.roles = [...(userWithRoles.roles || []), role];
    await userRepo.save(userWithRoles);

    return userWithRoles;
  }

  private async sendWelcomeSms(
    ctx: RequestContext,
    phoneNumber: string,
    channelId: string,
    isExistingUser: boolean
  ): Promise<void> {
    try {
      const channel = await this.channelService.findOne(ctx, channelId);
      const companyName = channel?.code || 'your organization';

      const message = isExistingUser
        ? `Welcome! You've been added as an administrator to ${companyName}. You can now access the dashboard. Go to https://dukarun.com/login to get started.`
        : `Welcome to ${companyName}! You've been added as an administrator. You can now access the dashboard. Go to https://dukarun.com/login to get started.`;

      const result = await this.communicationService.send({
        channel: 'sms',
        recipient: phoneNumber,
        body: message,
        metadata: { purpose: 'welcome_sms' },
      });

      if (!result.success) {
        this.logger.warn(`Failed to send welcome SMS to ${phoneNumber}: ${result.error}`);
      }
    } catch (error) {
      this.logger.warn(
        `Error sending welcome SMS: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private generateTemporaryPassword(): string {
    return Math.random().toString(36).slice(-12) + '!A1';
  }
}
