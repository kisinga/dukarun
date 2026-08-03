import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventBus, RequestContext, User } from '@vendure/core';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { TracingService } from '../../infrastructure/observability/tracing.service';
import { CompanyRegisteredEvent } from '../../infrastructure/events/custom-events';
import { ACCOUNT_CODES } from '../../ledger/account-codes.constants';
import { AccessProvisionerService } from './provisioning/access-provisioner.service';
import { ChannelProvisionerService } from './provisioning/channel-provisioner.service';
import { PaymentProvisionerService } from './provisioning/payment-provisioner.service';
import { RegistrationErrorService } from './provisioning/registration-error.service';
import { RegistrationValidatorService } from './provisioning/registration-validator.service';
import { RoleProvisionerService } from './provisioning/role-provisioner.service';
import { SellerProvisionerService } from './provisioning/seller-provisioner.service';
import { ChartOfAccountsService } from '../financial/chart-of-accounts.service';
import { StoreProvisionerService } from './provisioning/store-provisioner.service';

/**
 * Registration Input Data
 */
export interface RegistrationInput {
  companyName: string;
  // companyCode is NOT part of input - always generated from companyName by backend
  currency: string;
  adminFirstName: string;
  adminLastName: string;
  adminPhoneNumber: string;
  adminEmail?: string;
  storeName: string;
  storeAddress: string;
}

/**
 * Provision Result
 */
export interface ProvisionResult {
  sellerId: string;
  channelId: string;
  stockLocationId: string;
  roleId: string;
  adminId: string;
  userId: string;
}

/**
 * Registration Service (Orchestrator)
 *
 * Coordinates customer registration provisioning flow.
 * Delegates to specialized provisioner services following LOB (Line of Business) boundaries:
 *
 * - Channel: Company workspace/tenant
 * - Store: Physical location (stock location)
 * - Payment: Payment processing capabilities
 * - Role: Access control and permissions
 * - Access: User authentication and authorization
 *
 * NOTE: This service's `provisionCustomer` method is designed to be called
 * within a transaction (via `connection.withTransaction`). All database operations
 * within this method will be part of that transaction, ensuring atomicity.
 *
 * IMPORTANT: This service does NOT create Customer entities.
 * The registered user is a channel-scoped Administrator (not superadmin).
 *
 * NOTE: Registration is passwordless - uses OTP for authentication.
 * A secure random password is generated internally to satisfy Vendure's requirements
 * but is never used for authentication (passwordless auth via OTP).
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly validator: RegistrationValidatorService,
    private readonly sellerProvisioner: SellerProvisionerService,
    private readonly channelProvisioner: ChannelProvisionerService,
    private readonly storeProvisioner: StoreProvisionerService,
    private readonly paymentProvisioner: PaymentProvisionerService,
    private readonly roleProvisioner: RoleProvisionerService,
    private readonly accessProvisioner: AccessProvisionerService,
    private readonly errorService: RegistrationErrorService,
    private readonly chartOfAccountsService: ChartOfAccountsService,
    private readonly eventBus: EventBus,
    @Optional() private readonly tracingService?: TracingService
  ) {}

  /**
   * Provision customer entities (Channel, Stock Location, Payment Methods, Role, Admin)
   *
   * Entity creation order (critical, must follow this sequence):
   * 1. Validate input (currency, channel code uniqueness, zones)
   * 2. Create Seller (vendor entity for channel isolation)
   * 3. Create Channel (company workspace) - requires seller and zones
   * 4. Create Store (stock location) and assign to channel
   * 5. Create Payment Methods (Cash + M-Pesa) and assign to channel
   * 6. Create Role (access control) with all permissions and assign to channel
   * 7. Create Access (user + administrator) with role assignment
   *
   * All operations run within a transaction for atomicity.
   */
  async provisionCustomer(
    ctx: RequestContext,
    registrationData: RegistrationInput,
    existingUser?: User
  ): Promise<ProvisionResult> {
    const span = this.tracingService?.startSpan('registration.provisionCustomer', {
      'registration.company_name': registrationData.companyName,
      'registration.currency': registrationData.currency,
    });

    try {
      // Normalize phone number at the very start for consistent usage
      const formattedPhone = formatPhoneNumber(registrationData.adminPhoneNumber);

      // Step 1: Validate input (currency, channel code, zones)
      this.logger.log('Validating registration input');
      await this.validator.validateInput(ctx, registrationData);
      const kenyaZone = await this.validator.getKenyaZone(ctx);

      // Step 2: Create Seller (vendor entity for channel isolation)
      this.logger.log(`Creating seller for: ${registrationData.companyName}`);
      this.tracingService?.addEvent(span!, 'registration.seller.creating');
      const seller = await this.sellerProvisioner.createSeller(ctx, registrationData);
      this.logger.log(`Seller created: ${seller.id}`);
      this.tracingService?.setAttributes(span!, {
        'registration.seller_id': seller.id.toString(),
      });
      this.tracingService?.addEvent(span!, 'registration.seller.created');

      // Step 3: Create Channel (company workspace)
      this.logger.log(`Creating channel for: ${registrationData.companyName}`);
      this.tracingService?.addEvent(span!, 'registration.channel.creating');
      const channel = await this.channelProvisioner.createChannel(
        ctx,
        registrationData,
        kenyaZone,
        formattedPhone,
        seller.id.toString()
      );
      this.logger.log(`Channel created: ${channel.id} Token: ${channel.token}`);
      this.tracingService?.setAttributes(span!, {
        'registration.channel_id': channel.id.toString(),
      });
      this.tracingService?.addEvent(span!, 'registration.channel.created');

      const initResult = await this.chartOfAccountsService.initializeForChannel(
        ctx,
        Number(channel.id)
      );
      this.logger.log(`Chart of accounts initialized for channel ${channel.id}`);

      // Verify all required accounts exist (created or already existed)
      // Use the result from initialization to verify, avoiding transaction visibility issues
      // This approach tracks accounts during creation rather than querying, which avoids
      // transaction isolation issues where queries might not see uncommitted changes
      const allAccountCodes = [...initResult.created, ...initResult.existing];
      const requiredCodes = [
        ACCOUNT_CODES.CASH, // Parent account
        ACCOUNT_CODES.CASH_ON_HAND,
        ACCOUNT_CODES.BANK_MAIN,
        ACCOUNT_CODES.CLEARING_MPESA,
        ACCOUNT_CODES.CLEARING_CREDIT,
        ACCOUNT_CODES.CLEARING_GENERIC,
        ACCOUNT_CODES.SALES,
        ACCOUNT_CODES.SALES_RETURNS,
        ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        ACCOUNT_CODES.INVENTORY,
        ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        ACCOUNT_CODES.TAX_PAYABLE,
        ACCOUNT_CODES.PURCHASES,
        ACCOUNT_CODES.EXPENSES,
        ACCOUNT_CODES.PROCESSOR_FEES,
        ACCOUNT_CODES.CASH_SHORT_OVER,
        ACCOUNT_CODES.COGS,
        ACCOUNT_CODES.INVENTORY_WRITE_OFF,
        ACCOUNT_CODES.EXPIRY_LOSS,
      ];
      const found = new Set(allAccountCodes);
      const missing = requiredCodes.filter(code => !found.has(code));

      if (missing.length > 0) {
        throw this.errorService.createError(
          'PROVISIONING_FAILED',
          `Missing required accounts for channel ${channel.id}: ${missing.join(', ')}`
        );
      }

      this.logger.log(`Chart of accounts verified for channel ${channel.id}`);

      // Step 4: Create Store (stock location) and assign to channel
      this.logger.log(`Creating store: ${registrationData.storeName}`);
      const stockLocation = await this.storeProvisioner.createAndAssignStore(
        ctx,
        registrationData,
        channel.id
      );
      this.logger.log(`Store created and assigned: ${stockLocation.id}`);

      // Step 5: Create Payment Methods and assign to channel
      this.logger.log(`Creating payment methods for channel: ${channel.id}`);
      const paymentMethods = await this.paymentProvisioner.createAndAssignPaymentMethods(
        ctx,
        channel.id.toString(),
        channel.code // Use channel.code (which is the generated company code from companyName)
      );
      this.logger.log(`Payment methods created and assigned: ${paymentMethods.length}`);

      // Step 6: Create Role (access control) with all permissions
      this.logger.log(`Creating admin role for channel: ${channel.id}`);
      const role = await this.roleProvisioner.createAdminRole(
        ctx,
        registrationData,
        channel.id,
        channel.code // Use channel.code (which is the generated company code from companyName)
      );
      this.logger.log(`Admin role created: ${role.id} Code: ${role.code}`);

      // Step 7: Create Access (user + administrator) with role
      this.logger.log(`Creating administrator with role: ${role.id}`);
      const administrator = await this.accessProvisioner.createAdministrator(
        ctx,
        registrationData,
        role,
        formattedPhone,
        existingUser
      );
      this.logger.log(`Administrator created: ${administrator.id}`);

      // Verify all required entities were created
      if (!administrator.user) {
        throw this.errorService.createError(
          'PROVISIONING_FAILED',
          'Failed to create administrator user'
        );
      }

      const result = {
        sellerId: seller.id.toString(),
        channelId: channel.id.toString(),
        stockLocationId: stockLocation.id.toString(),
        roleId: role.id.toString(),
        adminId: administrator.id.toString(),
        userId: administrator.user.id.toString(),
      };

      this.tracingService?.setAttributes(span!, {
        'registration.seller_id': seller.id.toString(),
        'registration.stock_location_id': stockLocation.id.toString(),
        'registration.role_id': role.id.toString(),
        'registration.admin_id': administrator.id.toString(),
        'registration.user_id': administrator.user.id.toString(),
      });
      this.tracingService?.addEvent(span!, 'registration.complete', {
        'registration.channel_id': channel.id.toString(),
      });

      this.logger.log(`Provisioning complete: ${JSON.stringify(result)}`);

      // Notify platform admins about new registration
      this.eventBus.publish(
        new CompanyRegisteredEvent(ctx, {
          companyName: registrationData.companyName,
          companyCode: channel.code,
          channelId: channel.id.toString(),
          adminName: `${registrationData.adminFirstName} ${registrationData.adminLastName}`,
          adminPhone: formattedPhone,
          adminEmail: registrationData.adminEmail,
          storeName: registrationData.storeName,
        })
      );

      this.tracingService?.endSpan(span!, true);
      return result;
    } catch (error: any) {
      this.errorService.logError('RegistrationService', error, 'Provisioning');
      this.tracingService?.endSpan(
        span!,
        false,
        error instanceof Error ? error : new Error(String(error))
      );
      throw this.errorService.wrapError(error, 'PROVISIONING_FAILED');
    }
  }
}
