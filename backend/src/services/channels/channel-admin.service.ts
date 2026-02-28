import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Administrator,
  AdministratorEvent,
  AdministratorService,
  Channel,
  EventBus,
  NativeAuthenticationMethod,
  PasswordCipher,
  Permission,
  RequestContext,
  Role,
  RoleEvent,
  RoleService,
  TransactionalConnection,
  User,
  ChannelService,
} from '@vendure/core';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { RoleTemplate } from '../../domain/role-template/role-template.entity';
import { RoleTemplateAssignment } from '../../domain/role-template/role-template-assignment.entity';
import { RoleTemplateService } from './role-template.service';
import { formatPhoneNumber } from '../../utils/phone.utils';

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
    private readonly roleTemplateService: RoleTemplateService,
    private readonly passwordCipher: PasswordCipher,
    private readonly eventBus: EventBus
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
    const channelId = this.requireChannelId(ctx);

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
    try {
      cleanInput.phoneNumber = formatPhoneNumber(cleanInput.phoneNumber);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error
          ? e.message
          : 'Invalid phone number format. Expected 0XXXXXXXXX (10 digits starting with 0).'
      );
    }

    const existingUser = await this.findExistingUserByPhone(ctx, cleanInput.phoneNumber);

    if (existingUser) {
      // User exists - check if they already belong to this channel
      if (this.userBelongsToChannel(existingUser, channelId)) {
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

      const administrator = await this.findOrCreateAdministratorForUser(
        ctx,
        existingUser,
        cleanInput
      );

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

    const administrator = await this.createUserAndAdministratorViaRepository(ctx, role, cleanInput);

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
    const channelId = this.requireChannelId(ctx);

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

    if (
      !user ||
      !user.roles.some(role => role.channels?.some(ch => this.channelIdMatches(ch.id, channelId)))
    ) {
      throw new BadRequestException('Administrator does not belong to this channel');
    }

    const role = user.roles.find(r =>
      r.channels?.some(ch => this.channelIdMatches(ch.id, channelId))
    );
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
    this.requireChannelId(ctx);

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
   * Create a new role from a template (no overrides) via repository.
   * Bypasses RoleService.create() so channel admins with UpdateSettings can add admins
   * without needing to pass Vendure's CreateAdministrator check inside RoleService.
   */
  private async createRoleForTemplate(
    ctx: RequestContext,
    channelId: string | number,
    template: RoleTemplate,
    cleanInput: { firstName: string; lastName: string }
  ): Promise<Role> {
    const channel = await this.connection.getRepository(ctx, Channel).findOne({
      where: { id: typeof channelId === 'string' ? parseInt(channelId, 10) : channelId },
    });
    if (!channel) {
      throw new BadRequestException(`Channel ${channelId} not found`);
    }
    const roleCode = `channel-${channelId}-${template.id}`;
    const role = new Role({
      code: roleCode,
      description: `${template.name} role for ${cleanInput.firstName} ${cleanInput.lastName}`,
      permissions: (template.permissions ?? []) as Permission[],
      channels: [channel],
    });
    const savedRole = await this.connection.getRepository(ctx, Role).save(role);
    await this.connection.getRepository(ctx, RoleTemplateAssignment).save({
      roleId: savedRole.id as number,
      templateId: template.id,
    });
    await this.eventBus.publish(
      new RoleEvent(ctx, savedRole, 'created', {
        code: roleCode,
        description: role.description,
        permissions: role.permissions,
        channelIds: [channel.id],
      })
    );
    await this.auditService
      .log(ctx, 'role.created', {
        entityType: 'Role',
        entityId: savedRole.id.toString(),
        data: { templateCode: template.code, roleCode },
      })
      .catch(() => {});
    return savedRole;
  }

  /**
   * Create a custom role with overridden permissions via repository. No template assignment.
   */
  private async createRoleWithOverrides(
    ctx: RequestContext,
    channelId: string | number,
    template: RoleTemplate,
    permissions: string[],
    cleanInput: { firstName: string; lastName: string }
  ): Promise<Role> {
    const channel = await this.connection.getRepository(ctx, Channel).findOne({
      where: { id: typeof channelId === 'string' ? parseInt(channelId, 10) : channelId },
    });
    if (!channel) {
      throw new BadRequestException(`Channel ${channelId} not found`);
    }
    const roleCode = `channel-${channelId}-${template.code}-custom-${Date.now()}`;
    const role = new Role({
      code: roleCode,
      description: `${template.name} role (custom) for ${cleanInput.firstName} ${cleanInput.lastName}`,
      permissions: permissions as Permission[],
      channels: [channel],
    });
    const savedRole = await this.connection.getRepository(ctx, Role).save(role);
    await this.eventBus.publish(
      new RoleEvent(ctx, savedRole, 'created', {
        code: roleCode,
        description: role.description,
        permissions: role.permissions,
        channelIds: [channel.id],
      })
    );
    await this.auditService
      .log(ctx, 'role.created', {
        entityType: 'Role',
        entityId: savedRole.id.toString(),
        data: { templateCode: template.code, roleCode },
      })
      .catch(() => {});
    return savedRole;
  }

  /**
   * Create user, native auth method, and administrator via repository.
   * Bypasses AdministratorService.create() so channel admins with UpdateSettings can add admins
   * without needing CreateAdministrator permission (which Vendure may enforce in a way that fails for channel-scoped roles).
   */
  private async createUserAndAdministratorViaRepository(
    ctx: RequestContext,
    role: Role,
    cleanInput: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
      emailAddress?: string;
    }
  ): Promise<Administrator> {
    const password = this.generateTemporaryPassword();
    const emailToUse =
      cleanInput.emailAddress && cleanInput.emailAddress.trim().length > 0
        ? cleanInput.emailAddress.trim()
        : cleanInput.phoneNumber;

    const user = new User({
      identifier: cleanInput.phoneNumber,
      verified: true,
      roles: [role],
    });
    const savedUser = await this.connection.getRepository(ctx, User).save(user);

    const passwordHash = await this.passwordCipher.hash(password);
    const authMethod = new NativeAuthenticationMethod({
      identifier: cleanInput.phoneNumber,
      passwordHash,
      user: savedUser,
    });
    await this.connection.getRepository(ctx, NativeAuthenticationMethod).save(authMethod);

    const administrator = new Administrator({
      emailAddress: emailToUse,
      firstName: cleanInput.firstName,
      lastName: cleanInput.lastName,
      user: savedUser,
    });
    const savedAdmin = await this.connection.getRepository(ctx, Administrator).save(administrator);
    await this.eventBus.publish(new AdministratorEvent(ctx, savedAdmin, 'created'));
    return savedAdmin;
  }

  /**
   * Count distinct administrators for the channel (one row per admin, not per role).
   * Excludes soft-deleted users and administrators. Uses rawConnection so the count
   * is not affected by request-context filtering.
   */
  private async getChannelAdminCount(
    ctx: RequestContext,
    channelId: string | number
  ): Promise<number> {
    const id = typeof channelId === 'string' ? parseInt(channelId, 10) : channelId;
    const result = await this.connection.rawConnection
      .getRepository(Administrator)
      .createQueryBuilder('admin')
      .innerJoin('admin.user', 'user')
      .innerJoin('user.roles', 'role')
      .innerJoin('role.channels', 'channel')
      .where('channel.id = :id', { id })
      .andWhere('user.deletedAt IS NULL')
      .andWhere('admin.deletedAt IS NULL')
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

  private userBelongsToChannel(user: User, channelId: string | number): boolean {
    if (!user.roles) {
      return false;
    }
    return user.roles.some(role =>
      role.channels?.some(channel => this.channelIdMatches(channel.id, channelId))
    );
  }

  /** Fail fast when channel context is missing (e.g. missing vendure-token header). */
  private requireChannelId(ctx: RequestContext): string | number {
    if (ctx.channelId == null) {
      throw new BadRequestException('Channel context is required');
    }
    return ctx.channelId;
  }

  /** Compare channel IDs safely (Vendure can use string or number). */
  private channelIdMatches(a: string | number, b: string | number): boolean {
    return String(a) === String(b);
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

  /**
   * Find an existing Administrator for the user, or create one (e.g. when re-adding a user
   * who was previously disabled and had their Administrator entity removed).
   */
  private async findOrCreateAdministratorForUser(
    ctx: RequestContext,
    existingUser: User,
    cleanInput: { firstName: string; lastName: string; phoneNumber: string; emailAddress?: string }
  ): Promise<Administrator> {
    const existing = await this.connection.getRepository(ctx, Administrator).findOne({
      where: { user: { id: existingUser.id } },
    });
    if (existing) {
      return existing;
    }
    const emailToUse =
      cleanInput.emailAddress && cleanInput.emailAddress.trim().length > 0
        ? cleanInput.emailAddress.trim()
        : cleanInput.phoneNumber;
    const administrator = new Administrator({
      emailAddress: emailToUse,
      firstName: cleanInput.firstName,
      lastName: cleanInput.lastName,
      user: existingUser,
    });
    const savedAdmin = await this.connection.getRepository(ctx, Administrator).save(administrator);
    await this.eventBus.publish(new AdministratorEvent(ctx, savedAdmin, 'created'));
    return savedAdmin;
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
        ctx,
        channelId,
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
