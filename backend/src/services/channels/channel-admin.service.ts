import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Administrator,
  AdministratorEvent,
  AdministratorService,
  Channel,
  ChannelService,
  EventBus,
  NativeAuthenticationMethod,
  PasswordCipher,
  Permission,
  RequestContext,
  Role,
  RoleEvent,
  RoleService,
  SessionService,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { CUSTOMER_ROLE_CODE } from '@vendure/common/lib/shared-constants';
import crypto from 'crypto';
import { IsNull } from 'typeorm';
import { RoleTemplateAssignment } from '../../domain/role-template/role-template-assignment.entity';
import { RoleTemplate } from '../../domain/role-template/role-template.entity';
import { AuditService } from '../../infrastructure/audit/audit.service';
import { CommunicationService } from '../../infrastructure/communication/communication.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { formatPhoneNumber } from '../../utils/phone.utils';
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
    private readonly roleTemplateService: RoleTemplateService,
    private readonly passwordCipher: PasswordCipher,
    private readonly eventBus: EventBus,
    private readonly entitlementService: EntitlementService,
    private readonly sessionService: SessionService
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
      // User exists - check if they already belong to this channel as an active admin.
      if (this.userBelongsToChannel(existingUser, channelId)) {
        const activeAdmin = await this.findActiveAdministratorForUser(ctx, existingUser.id);
        if (activeAdmin) {
          throw new BadRequestException(
            `Administrator with phone number ${cleanInput.phoneNumber} already belongs to this channel`
          );
        }
        // Stale channel role left behind by the old hard-delete path: remove it
        // before re-adding, otherwise the re-add will fail or attach a duplicate role.
        await this.removeChannelRolesFromUser(ctx, existingUser.id, channelId);
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

    if (!user || !user.roles.some(role => this.isChannelAdminRole(role, channelId))) {
      throw new BadRequestException('Administrator does not belong to this channel');
    }

    const role = user.roles.find(r => this.isChannelAdminRole(r, channelId));
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
   * Disable a channel administrator for the current channel.
   * - Verifies the administrator belongs to the current channel (no cross-tenant disables).
   * - Removes only this channel's admin roles, preserving access to other channels.
   *   The customer role (__customer_role__) is never treated as admin access and is
   *   never stripped: dual-role users (admin + customer) keep their customer access.
   * - Soft-deletes the Administrator row only when the user has no remaining channel admin roles.
   * - Invalidates the user's active sessions so revoked permissions take effect immediately.
   */
  async disableChannelAdministrator(
    ctx: RequestContext,
    adminId: string
  ): Promise<{ success: boolean; message: string }> {
    const channelId = this.requireChannelId(ctx);

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
      relations: ['roles', 'roles.channels'],
    });

    if (!user) {
      throw new NotFoundException(`User for administrator ${adminId} not found`);
    }

    // Security: the administrator must actually belong to the channel being modified.
    const belongsToChannel = user.roles.some(role => this.isChannelAdminRole(role, channelId));
    if (!belongsToChannel) {
      throw new BadRequestException(
        `Administrator with ID ${adminId} does not belong to this channel`
      );
    }

    // Remove only the admin roles scoped to this channel.
    const rolesToRemove = user.roles.filter(role => this.isChannelAdminRole(role, channelId));
    if (rolesToRemove.length > 0) {
      await this.connection
        .getRepository(ctx, User)
        .createQueryBuilder()
        .relation(User, 'roles')
        .of(user.id)
        .remove(rolesToRemove.map(role => role.id));
    }

    // Determine whether the user still has admin access anywhere else.
    // A channel admin role is identified by having at least one channel assigned.
    const remainingChannelAdminRoles = user.roles.filter(
      role =>
        !rolesToRemove.some(r => r.id === role.id) &&
        this.isAdminRole(role) &&
        (role.channels?.length ?? 0) > 0
    );

    if (remainingChannelAdminRoles.length === 0) {
      // No remaining channel admin access: soft-delete the Administrator row.
      administrator.deletedAt = new Date();
      await this.connection.getRepository(ctx, Administrator).save(administrator);
    }

    // Invalidate active sessions so the role change is effective immediately.
    // SessionService also evicts the session cache; a raw repository delete would
    // leave revoked permissions alive until cache expiry.
    await this.sessionService.deleteSessionsByUser(ctx, user);

    await this.auditService
      .log(ctx, 'admin.disabled', {
        entityType: 'Administrator',
        entityId: adminId,
        data: {
          firstName: administrator.firstName,
          lastName: administrator.lastName,
          channelId: channelId.toString(),
          softDeleted: remainingChannelAdminRoles.length === 0,
        },
      })
      .catch(err => {
        this.logger.warn(
          `Failed to log admin disable audit: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return {
      success: true,
      message:
        remainingChannelAdminRoles.length === 0
          ? 'Administrator disabled successfully'
          : 'Administrator removed from this channel',
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

      return user.roles.some(
        role => role.code !== CUSTOMER_ROLE_CODE && (!role.channels || role.channels.length === 0)
      );
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
    const channelId = String(ctx.channelId!);
    const count = await this.getChannelAdminCount(ctx, channelId);
    const limit = await this.entitlementService.getLimit(ctx, channelId, 'maxAdmins');

    // Default to 5 admins when the tier does not configure a limit.
    // A limit of 0 means unlimited.
    const effectiveLimit = limit === undefined ? 5 : limit;
    if (effectiveLimit > 0 && count >= effectiveLimit) {
      throw new BadRequestException(
        `Maximum admin count (${effectiveLimit}) reached for this channel.`
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

  private async findActiveAdministratorForUser(
    ctx: RequestContext,
    userId: number | string
  ): Promise<Administrator | null> {
    try {
      return await this.connection.getRepository(ctx, Administrator).findOne({
        where: { user: { id: userId as any }, deletedAt: IsNull() },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to find active administrator for user: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private async removeChannelRolesFromUser(
    ctx: RequestContext,
    userId: number | string,
    channelId: string | number
  ): Promise<void> {
    try {
      const user = await this.connection.getRepository(ctx, User).findOne({
        where: { id: userId as any },
        relations: ['roles', 'roles.channels'],
      });
      if (!user || user.roles.length === 0) return;

      const rolesToRemove = user.roles.filter(role => this.isChannelAdminRole(role, channelId));
      if (rolesToRemove.length === 0) return;

      await this.connection
        .getRepository(ctx, User)
        .createQueryBuilder()
        .relation(User, 'roles')
        .of(userId)
        .remove(rolesToRemove.map(role => role.id));
    } catch (error) {
      this.logger.warn(
        `Failed to remove channel roles from user: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private userBelongsToChannel(user: User, channelId: string | number): boolean {
    if (!user.roles) {
      return false;
    }
    return user.roles.some(role => this.isChannelAdminRole(role, channelId));
  }

  /**
   * True when the role grants admin access (i.e. it is not the customer role).
   * Dual-role users (admin + customer) carry __customer_role__, which must never
   * count as admin access nor be stripped by admin lifecycle operations.
   */
  private isAdminRole(role: Role): boolean {
    return role.code !== CUSTOMER_ROLE_CODE;
  }

  /** True when the role grants admin access scoped to the given channel. */
  private isChannelAdminRole(role: Role, channelId: string | number): boolean {
    return (
      this.isAdminRole(role) &&
      !!role.channels?.some(channel => this.channelIdMatches(channel.id, channelId))
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
   * Find an existing Administrator for the user, reactivate it if soft-deleted,
   * or create one when re-adding a previously disabled channel admin.
   * Also restores User.deletedAt so the account can authenticate again.
   */
  private async findOrCreateAdministratorForUser(
    ctx: RequestContext,
    existingUser: User,
    cleanInput: { firstName: string; lastName: string; phoneNumber: string; emailAddress?: string }
  ): Promise<Administrator> {
    const adminRepo = this.connection.getRepository(ctx, Administrator);
    const existing = await adminRepo.findOne({
      where: { user: { id: existingUser.id } },
    });
    if (existing) {
      let reactivated = false;
      if (existing.deletedAt) {
        existing.deletedAt = null as any;
        await adminRepo.save(existing);
        reactivated = true;
      }
      if (existingUser.deletedAt) {
        existingUser.deletedAt = null as any;
        await this.connection.getRepository(ctx, User).save(existingUser);
        reactivated = true;
      }
      if (reactivated) {
        await this.eventBus.publish(new AdministratorEvent(ctx, existing, 'updated'));
      }
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
    const savedAdmin = await adminRepo.save(administrator);
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
        : `Welcome to Dukarun! You've been added as an administrator to ${companyName}. You can now access the dashboard. Go to https://dukarun.com/login to get started.`;

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
    return crypto.randomBytes(9).toString('base64url').slice(0, 12) + '!A1';
  }
}
