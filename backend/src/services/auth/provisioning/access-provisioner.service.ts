import { Injectable, Logger } from '@nestjs/common';
import {
  Administrator,
  AdministratorEvent,
  EventBus,
  ID,
  NativeAuthenticationMethod,
  PasswordCipher,
  RequestContext,
  Role,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { AdminActionEvent } from '../../../infrastructure/events/custom-events';
import { RegistrationInput } from '../registration.service';
import { RegistrationAuditorService } from './registration-auditor.service';
import { RegistrationErrorService } from './registration-error.service';
import { generateSentinelEmailFromPhone } from '../../../utils/email.utils';

/**
 * Access Provisioner Service
 *
 * Handles user and administrator creation with role assignment.
 * LOB: Access = User authentication and authorization (who can access the channel).
 */
@Injectable()
export class AccessProvisionerService {
  private readonly logger = new Logger(AccessProvisionerService.name);

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly passwordCipher: PasswordCipher,
    private readonly eventBus: EventBus,
    private readonly auditor: RegistrationAuditorService,
    private readonly errorService: RegistrationErrorService
  ) {}

  /**
   * Create administrator with user and role assignment
   */
  async createAdministrator(
    ctx: RequestContext,
    registrationData: RegistrationInput,
    role: Role,
    phoneNumber: string,
    existingUser?: User
  ): Promise<Administrator> {
    try {
      let user: User;
      let userCreated = false;

      if (existingUser) {
        user = await this.attachRoleToExistingUser(ctx, existingUser, role);
      } else {
        user = await this.createUser(ctx, phoneNumber, role, registrationData);
        userCreated = true;
      }

      // Verify user-role linkage and get verified user
      const verifiedUser = await this.verifyUserRoleLinkage(ctx, user.id, role.id);

      // Ensure administrator linked to verified user
      const { administrator, created: adminCreated } = await this.ensureAdministratorEntity(
        ctx,
        registrationData,
        phoneNumber,
        verifiedUser
      );

      // Audit and emit events
      await this.auditAndEmitEvents(ctx, verifiedUser, administrator, role, registrationData, {
        userCreated,
        adminCreated,
      });

      return administrator;
    } catch (error: any) {
      this.errorService.logError('AccessProvisioner', error, 'Administrator creation');
      throw this.errorService.wrapError(error, 'ADMIN_CREATE_FAILED');
    }
  }

  /**
   * Create user and administrator using Repository Bootstrap
   * Bypasses AdministratorService.create() to avoid permission issues.
   */
  private async createUser(
    ctx: RequestContext,
    phoneNumber: string,
    role: Role,
    registrationData: RegistrationInput
  ): Promise<User> {
    const password = this.generateSecurePassword();
    const emailToUse =
      registrationData.adminEmail || generateSentinelEmailFromPhone(phoneNumber, 'admin');

    // Create User entity
    const user = new User({
      identifier: phoneNumber,
      verified: true,
      roles: [role],
    });

    const savedUser = await this.connection.getRepository(ctx, User).save(user);

    // Create Authentication Method
    const passwordHash = await this.passwordCipher.hash(password);
    const authMethod = new NativeAuthenticationMethod({
      identifier: phoneNumber,
      passwordHash,
      user: savedUser,
    });

    await this.connection.getRepository(ctx, NativeAuthenticationMethod).save(authMethod);

    return savedUser;
  }

  /**
   * Attach role to existing user via Repository
   */
  private async attachRoleToExistingUser(
    ctx: RequestContext,
    existingUser: User,
    role: Role
  ): Promise<User> {
    const userRepo = this.connection.getRepository(ctx, User);
    const userWithRoles = await userRepo.findOne({
      where: { id: existingUser.id },
      relations: ['roles'],
    });

    if (!userWithRoles) {
      throw this.errorService.createError(
        'USER_ASSIGN_FAILED',
        `Existing user ${existingUser.id} not found`
      );
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

  private async verifyUserRoleLinkage(ctx: RequestContext, userId: ID, roleId: ID): Promise<User> {
    const userRepo = this.connection.getRepository(ctx, User);
    const verifiedUser = await userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!verifiedUser) {
      throw this.errorService.createError(
        'USER_ASSIGN_FAILED',
        'Failed to load user for verification'
      );
    }

    if (!verifiedUser.roles || !verifiedUser.roles.some(r => r.id === roleId)) {
      throw this.errorService.createError(
        'USER_ASSIGN_FAILED',
        `User ${userId} is not properly linked to role ${roleId}`
      );
    }

    return verifiedUser;
  }

  /**
   * Ensure administrator entity exists via Repository
   */
  private async ensureAdministratorEntity(
    ctx: RequestContext,
    registrationData: RegistrationInput,
    phoneNumber: string,
    user: User
  ): Promise<{ administrator: Administrator; created: boolean }> {
    const emailToUse =
      registrationData.adminEmail || generateSentinelEmailFromPhone(phoneNumber, 'admin');
    const adminRepo = this.connection.getRepository(ctx, Administrator);

    let administrator = await adminRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    if (!administrator) {
      // Create new Administrator
      const newAdmin = new Administrator({
        emailAddress: emailToUse,
        firstName: registrationData.adminFirstName,
        lastName: registrationData.adminLastName,
        user: user,
      });

      administrator = await adminRepo.save(newAdmin);

      // Publish AdministratorEvent
      await this.eventBus.publish(new AdministratorEvent(ctx, administrator, 'created'));

      return { administrator, created: true };
    }

    // Update existing Administrator if needed
    let requiresUpdate = false;
    if (administrator.firstName !== registrationData.adminFirstName) {
      administrator.firstName = registrationData.adminFirstName;
      requiresUpdate = true;
    }
    if (administrator.lastName !== registrationData.adminLastName) {
      administrator.lastName = registrationData.adminLastName;
      requiresUpdate = true;
    }
    if (administrator.emailAddress !== emailToUse) {
      administrator.emailAddress = emailToUse;
      requiresUpdate = true;
    }

    if (requiresUpdate) {
      administrator = await adminRepo.save(administrator);
      await this.eventBus.publish(new AdministratorEvent(ctx, administrator, 'updated'));
    }

    return { administrator, created: false };
  }

  private async auditAndEmitEvents(
    ctx: RequestContext,
    user: User,
    administrator: Administrator,
    role: Role,
    registrationData: RegistrationInput,
    options: {
      userCreated: boolean;
      adminCreated: boolean;
    }
  ): Promise<void> {
    const channelId =
      role.channels && role.channels.length > 0 ? role.channels[0].id.toString() : null;

    if (!channelId) {
      return; // Cannot audit/emit without channel
    }

    // Audit logs
    if (options.userCreated) {
      await this.auditor.logEntityCreated(ctx, 'User', user.id.toString(), user, {
        identifier: user.identifier,
        adminId: administrator.id.toString(),
      });
    }

    if (options.adminCreated) {
      await this.auditor.logEntityCreated(
        ctx,
        'Administrator',
        administrator.id.toString(),
        administrator,
        {
          userId: user.id.toString(),
          firstName: registrationData.adminFirstName,
          lastName: registrationData.adminLastName,
          emailAddress: administrator.emailAddress,
        }
      );
    }

    // Emit events using new event classes
    const emptyCtx = RequestContext.empty();

    if (options.adminCreated) {
      this.eventBus.publish(
        new AdminActionEvent(emptyCtx, channelId, 'admin', 'created', {
          adminId: administrator.id.toString(),
          userId: user.id.toString(),
          firstName: registrationData.adminFirstName,
          lastName: registrationData.adminLastName,
        })
      );
    }

    if (options.userCreated) {
      this.eventBus.publish(
        new AdminActionEvent(emptyCtx, channelId, 'user', 'created', {
          userId: user.id.toString(),
          adminId: administrator.id.toString(),
        })
      );
    }
  }

  private generateSecurePassword(): string {
    // Generate a secure random password that will never be used
    // Since we're using passwordless auth, this password is just a placeholder
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
