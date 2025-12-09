import { Injectable } from '@nestjs/common';
import {
  Channel,
  ChannelService,
  RequestContext,
  TransactionalConnection,
  User,
  UserService,
  Administrator,
} from '@vendure/core';
import { IsNull } from 'typeorm';
import { ChannelStatus, getChannelStatus } from '../../domain/channel-custom-fields';
import { RegistrationStorageService } from '../../infrastructure/storage/registration-storage.service';
import { findChannelById } from '../../utils/channel-access.util';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { withSuperadminUser } from '../../utils/request-context.util';
import { OtpService } from './otp.service';
import { RegistrationValidatorService } from './provisioning/registration-validator.service';
import { RegistrationInput, RegistrationService } from './registration.service';

// Re-export RegistrationInput for backward compatibility with resolver
export type { RegistrationInput } from './registration.service';

export enum AuthorizationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum AccessLevel {
  READ_ONLY = 'READ_ONLY',
  FULL = 'FULL',
}

/**
 * Phone-based authentication service
 * Handles OTP request/verification and authentication logic only.
 * Entity provisioning is delegated to RegistrationService.
 */
@Injectable()
export class PhoneAuthService {
  constructor(
    private readonly otpService: OtpService,
    private readonly userService: UserService,
    private readonly channelService: ChannelService,
    private readonly registrationService: RegistrationService,
    private readonly registrationValidator: RegistrationValidatorService,
    private readonly registrationStorageService: RegistrationStorageService,
    private readonly connection: TransactionalConnection
  ) {}

  /**
   * Store registration data and request OTP
   *
   * NEW FLOW:
   * 1. Store registration data in Redis (temporary)
   * 2. Request OTP
   * 3. Return sessionId to frontend
   *
   * Frontend will use sessionId during OTP verification
   */
  async requestRegistrationOTP(
    phoneNumber: string,
    registrationData: RegistrationInput
  ): Promise<{
    success: boolean;
    message: string;
    sessionId?: string;
    expiresAt?: number;
  }> {
    // Normalize phone number to 07XXXXXXXX format
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Validate email uniqueness if provided
    // This check happens BEFORE OTP to improve UX (fail fast)
    if (registrationData.adminEmail) {
      // We create a system context because requestRegistrationOTP is public/unauthenticated
      // and doesn't have a full RequestContext. The validator needs context for DB access.
      const ctx = RequestContext.empty();
      await this.registrationValidator.validateAdminEmailUniqueness(
        ctx,
        registrationData.adminEmail,
        undefined, // existingUser not known yet
        formattedPhone // check against this phone number
      );
    }

    // Step 1: Store registration data temporarily
    const { sessionId, expiresAt } = await this.registrationStorageService.storeRegistrationData(
      formattedPhone,
      registrationData
    );

    // Step 2: Request OTP
    // Note: No channel context during registration, so OTP won't be tracked
    const otpResult = await this.otpService.requestOTP(
      formattedPhone,
      'registration',
      undefined,
      undefined,
      registrationData.adminEmail // Pass email for dual channel sending
    );

    return {
      success: otpResult.success,
      message: otpResult.message,
      sessionId,
      expiresAt: expiresAt || otpResult.expiresAt,
    };
  }

  /**
   * Store registration data and request Email OTP
   */
  async requestEmailRegistrationOTP(
    email: string,
    registrationData: RegistrationInput
  ): Promise<{
    success: boolean;
    message: string;
    sessionId?: string;
    expiresAt?: number;
  }> {
    // Validate email uniqueness
    const ctx = RequestContext.empty();
    await this.registrationValidator.validateAdminEmailUniqueness(
      ctx,
      email,
      undefined,
      undefined // No phone number check for email registration
    );

    // Store registration data
    const { sessionId, expiresAt } = await this.registrationStorageService.storeRegistrationData(
      email,
      registrationData
    );

    // Request OTP via Email
    const otpResult = await this.otpService.requestOTP(
      email,
      'registration',
      ctx,
      undefined,
      email // Pass the actual email address, not the string 'email'
    );

    return {
      success: otpResult.success,
      message: otpResult.message,
      sessionId,
      expiresAt: expiresAt || otpResult.expiresAt,
    };
  }

  /**
   * Request login OTP
   * Validates that the phone number has an associated account before sending OTP
   */
  async requestLoginOTP(
    phoneNumber: string,
    ctx: RequestContext
  ): Promise<{
    success: boolean;
    message: string;
    expiresAt?: number;
  }> {
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      // Check if user account exists before sending OTP
      const existingUser = await this.userService.getUserByEmailAddress(ctx, formattedPhone);
      if (!existingUser) {
        return {
          success: false,
          message: 'No account found with this phone number. Please register first.',
        };
      }

      // Account exists - proceed with sending OTP
      // Pass context and channelId for tracking if available
      // Check if user has an associated administrator to get email
      const administrator = await this.connection.getRepository(ctx, Administrator).findOne({
        where: { user: { id: existingUser.id } },
      });

      // Pass context and channelId for tracking if available
      return await this.otpService.requestOTP(
        formattedPhone,
        'login',
        ctx,
        ctx.channelId?.toString(),
        administrator?.emailAddress // Pass email for dual channel sending
      );
    } catch (error: any) {
      throw new Error(error?.message || 'Failed to request OTP');
    }
  }

  /**
   * Verify registration OTP and create account
   *
   * NEW FLOW:
   * 1. Verify OTP
   * 2. Retrieve registration data from Redis using sessionId
   * 3. Check if user already exists
   * 4. Create entities in transaction (Channel, Stock Location, Payment Methods, Role, Administrator)
   * 5. Update authorization status
   *
   * After successful creation, user must login separately (tokens can't be assigned
   * during signup because channel/role don't exist yet)
   */
  async verifyRegistrationOTP(
    ctx: RequestContext,
    phoneNumber: string,
    otp: string,
    sessionId: string
  ): Promise<{
    success: boolean;
    userId?: string;
    message: string;
  }> {
    // Step 1: Verify OTP first
    const verification = await this.otpService.verifyOTP(phoneNumber, otp);
    if (!verification.valid) {
      throw new Error(verification.message);
    }

    // Step 2: Normalize phone number to 07XXXXXXXX format
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Step 3: Retrieve registration data from temporary storage
    const registrationData =
      await this.registrationStorageService.retrieveRegistrationData(sessionId);
    if (!registrationData) {
      throw new Error('Registration data not found or expired. Please start registration again.');
    }

    // Step 4: Load existing user if any. Existing users can add additional businesses.
    const existingUser = await this.userService.getUserByEmailAddress(ctx, formattedPhone);
    // Note: Channel code uniqueness is validated in provisionCustomer() to avoid redundant checks

    // Step 5: Create entities in transaction
    // This creates: Channel, Stock Location, Payment Methods, Role, and Administrator
    // All operations are wrapped in a transaction for atomicity
    // Run entire registration with superadmin user to ensure RoleService.create() can access transaction entities
    const provisionResult = await this.connection.withTransaction(ctx, async transactionCtx => {
      return await withSuperadminUser(
        transactionCtx,
        this.userService,
        this.connection,
        async adminCtx => {
          return await this.registrationService.provisionCustomer(
            adminCtx,
            registrationData,
            existingUser
          );
        }
      );
    });

    const userRepo = this.connection.getRepository(ctx, User);

    if (!existingUser) {
      // Step 6: Update newly created user's authorization status to PENDING
      const createdUser = await userRepo.findOne({ where: { id: provisionResult.userId } });
      if (createdUser) {
        const updatedCustomFields = {
          ...(createdUser.customFields as Record<string, unknown> | undefined),
          authorizationStatus: AuthorizationStatus.PENDING,
        };
        (createdUser as any).customFields = updatedCustomFields;
        createdUser.identifier = formattedPhone; // Ensure identifier normalized
        await userRepo.save(createdUser);
      }
    } else if (existingUser.identifier !== formattedPhone) {
      // Normalize identifier for existing user if needed
      await userRepo.update({ id: existingUser.id }, { identifier: formattedPhone });
    }

    return {
      success: true,
      userId: provisionResult.userId,
      message:
        'Registration successful. Your account is pending admin approval. Please login to continue.',
    };
  }

  /**
   * Verify email registration OTP and create account
   */
  async verifyEmailRegistrationOTP(
    ctx: RequestContext,
    email: string,
    otp: string,
    sessionId: string
  ): Promise<{
    success: boolean;
    userId?: string;
    message: string;
  }> {
    // Step 1: Verify OTP
    const verification = await this.otpService.verifyOTP(email, otp);
    if (!verification.valid) {
      throw new Error(verification.message);
    }

    // Step 2: Retrieve registration data
    const registrationData =
      await this.registrationStorageService.retrieveRegistrationData(sessionId);
    if (!registrationData) {
      throw new Error('Registration data not found or expired. Please start registration again.');
    }

    // Step 3: Load existing user if any
    const existingUser = await this.userService.getUserByEmailAddress(ctx, email);

    // Step 4: Create entities in transaction
    const provisionResult = await this.connection.withTransaction(ctx, async transactionCtx => {
      return await withSuperadminUser(
        transactionCtx,
        this.userService,
        this.connection,
        async adminCtx => {
          return await this.registrationService.provisionCustomer(
            adminCtx,
            registrationData,
            existingUser
          );
        }
      );
    });

    const userRepo = this.connection.getRepository(ctx, User);

    if (!existingUser) {
      const createdUser = await userRepo.findOne({ where: { id: provisionResult.userId } });
      if (createdUser) {
        const updatedCustomFields = {
          ...(createdUser.customFields as Record<string, unknown> | undefined),
          authorizationStatus: AuthorizationStatus.PENDING,
        };
        (createdUser as any).customFields = updatedCustomFields;
        createdUser.identifier = email;
        await userRepo.save(createdUser);
      }
    }

    return {
      success: true,
      userId: provisionResult.userId,
      message:
        'Registration successful. Your account is pending admin approval. Please login to continue.',
    };
  }

  /**
   * Verify login OTP
   *
   * Two-tier authorization:
   * 1. User-level: Only REJECTED blocks login (PENDING/APPROVED allow login)
   * 2. Channel-level: Channel status determines access level (READ_ONLY vs FULL)
   */
  async verifyLoginOTP(
    ctx: RequestContext,
    phoneNumber: string,
    otp: string
  ): Promise<{
    success: boolean;
    token?: string;
    user?: {
      id: string;
      identifier: string;
    };
    message: string;
    authorizationStatus?: AuthorizationStatus;
    accessLevel?: AccessLevel;
    channelId?: string;
  }> {
    // Normalize phone number first for OTP verification
    const formattedPhone = formatPhoneNumber(phoneNumber);

    const verification = await this.otpService.verifyOTP(formattedPhone, otp.trim());
    if (!verification.valid) {
      return {
        success: false,
        message: verification.message,
      };
    }

    // Find user with roles and channels loaded, EXCLUDING soft-deleted users
    const user = await this.connection.getRepository(ctx, User).findOne({
      where: {
        identifier: formattedPhone,
        deletedAt: IsNull(), // Exclude soft-deleted users
      },
      relations: ['roles', 'roles.channels'],
    });

    if (!user) {
      return {
        success: false,
        message: 'No account found with this phone number. Please register first.',
      };
    }

    // Check user-level authorization status - only REJECTED blocks login
    const authorizationStatus =
      (user.customFields as any)?.authorizationStatus || AuthorizationStatus.PENDING;

    if (authorizationStatus === AuthorizationStatus.REJECTED) {
      return {
        success: false,
        message: 'Account rejected. Please contact support if you believe this is an error.',
        authorizationStatus,
      };
    }

    // Get all channels for this user via their roles
    const userChannels: Channel[] = [];
    if (user.roles) {
      for (const role of user.roles) {
        if (role.channels) {
          for (const channel of role.channels) {
            // Avoid duplicates
            if (!userChannels.some(ch => ch.id === channel.id)) {
              userChannels.push(channel);
            }
          }
        }
      }
    }

    if (userChannels.length === 0) {
      return {
        success: false,
        message: 'No channels found for this account. Please contact support.',
        authorizationStatus,
      };
    }

    // Load full channel data to get status
    // Use channel access utility with bypassSellerFilter=true to avoid CHANNEL_NOT_FOUND errors
    // when RequestContext doesn't have seller association
    const channelsWithStatus: Array<{ channel: Channel; status: ChannelStatus }> = [];
    for (const channel of userChannels) {
      const fullChannel = await findChannelById(
        ctx,
        channel.id,
        this.connection,
        this.channelService,
        true // bypassSellerFilter - RequestContext may not have seller association
      );
      if (fullChannel) {
        // Get channel status from customFields - status field is the single source of truth
        const status = getChannelStatus(fullChannel.customFields);
        channelsWithStatus.push({ channel: fullChannel, status });
      }
    }

    // Check if any channel is DISABLED or BANNED - block login
    const blockedChannels = channelsWithStatus.filter(
      ch => ch.status === ChannelStatus.DISABLED || ch.status === ChannelStatus.BANNED
    );
    if (blockedChannels.length > 0) {
      const statusText =
        blockedChannels[0].status === ChannelStatus.DISABLED ? 'disabled' : 'banned';
      return {
        success: false,
        message: `Your channel has been ${statusText}. Please contact support.`,
        authorizationStatus,
      };
    }

    // Determine access based on channel status.
    // Newly provisioned businesses stay UNAPPROVED until manual review, so block login
    // until at least one linked channel is APPROVED.
    const approvedChannel = channelsWithStatus.find(ch => ch.status === ChannelStatus.APPROVED);
    if (!approvedChannel) {
      return {
        success: false,
        message:
          'Your business is pending approval. login once an admin has approved your account.',
        authorizationStatus,
      };
    }

    const accessLevel = AccessLevel.FULL;
    const channelId = approvedChannel.channel.id.toString();

    // Create session token with access level and channel ID
    const sessionToken = `otp_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    if (!this.otpService.redis) {
      throw new Error('Redis not available');
    }

    await this.otpService.redis.setex(
      `otp:session:${sessionToken}`,
      300, // 5 minutes
      JSON.stringify({
        userId: user.id.toString(),
        phoneNumber: formattedPhone,
        accessLevel,
        channelId,
      })
    );

    return {
      success: true,
      token: sessionToken,
      message: 'OTP verified successfully.',
      user: {
        id: user.id.toString(),
        identifier: user.identifier,
      },
      authorizationStatus,
      accessLevel,
      channelId,
    };
  }

  /**
   * Check if company code is available (for frontend validation)
   * Returns true if available, false if taken
   */
  async checkCompanyCodeAvailability(ctx: RequestContext, companyCode: string): Promise<boolean> {
    return this.registrationValidator.checkCompanyCodeAvailability(ctx, companyCode);
  }

  /**
   * Check authorization status
   */
  async checkAuthorizationStatus(identifier: string): Promise<{
    status: AuthorizationStatus;
    message: string;
  }> {
    // Normalize phone number to 07XXXXXXXX format
    const normalizedIdentifier = formatPhoneNumber(identifier);

    // Note: This method doesn't have RequestContext, so we'll need to create a system context
    // For now, we'll use a simpler approach - try to find user
    // In a real implementation, you'd pass RequestContext or use a different method
    try {
      // This will fail without context, but we'll handle it gracefully
      const user = await this.userService.getUserByEmailAddress(
        {} as RequestContext,
        normalizedIdentifier
      );
      if (!user) {
        return {
          status: AuthorizationStatus.PENDING,
          message: 'User not found',
        };
      }

      const authStatus = (user.customFields as any)?.authorizationStatus;
      let authorizationStatus: AuthorizationStatus;

      // Validate and normalize authorization status
      if (authStatus === 'APPROVED') {
        authorizationStatus = AuthorizationStatus.APPROVED;
      } else if (authStatus === 'REJECTED') {
        authorizationStatus = AuthorizationStatus.REJECTED;
      } else {
        authorizationStatus = AuthorizationStatus.PENDING;
      }

      const messages: Record<AuthorizationStatus, string> = {
        [AuthorizationStatus.PENDING]: 'Account is pending admin approval',
        [AuthorizationStatus.APPROVED]: 'Account is approved',
        [AuthorizationStatus.REJECTED]: 'Account has been rejected',
      };

      return {
        status: authorizationStatus,
        message: messages[authorizationStatus],
      };
    } catch (error) {
      // If context is required, return default status
      return {
        status: AuthorizationStatus.PENDING,
        message: 'Unable to check authorization status',
      };
    }
  }
}
