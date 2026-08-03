import { OnModuleInit } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { gql } from 'graphql-tag';
import { CustomerResolver, CustomerAdminResolver } from './customer.resolver';
import { CustomerCreationService } from '../../services/customers/customer-creation.service';
import { CustomerLifecycleService } from '../../services/customers/customer-lifecycle.service';
import { CustomerLookupService } from '../../services/customers/customer-lookup.service';

const CUSTOMER_SCHEMA = gql`
  extend type Mutation {
    """
    Create a customer with duplicate prevention by phone number.
    If a customer with the same phone number exists, returns the existing customer.
    This is a safety net - the frontend should also check for duplicates.
    """
    createCustomerSafe(input: CreateCustomerInput!, isWalkIn: Boolean): Customer!
  }
`;

/**
 * Admin API additions: update/delete mutations that protect shared users (a User
 * that is both an Administrator and a Customer) from Vendure's stock behavior of
 * rewriting the User identifier or soft-deleting the User.
 * Admin-only because the shop schema does not define UpdateCustomerInput or
 * DeletionResponse.
 */
const CUSTOMER_ADMIN_SCHEMA = gql`
  extend type Mutation {
    """
    Update a customer without rewriting the login identifier of a shared user.
    """
    updateCustomerSafe(input: UpdateCustomerInput!): Customer!

    """
    Delete a customer without soft-deleting the shared user.
    """
    deleteCustomerSafe(id: ID!): DeletionResponse!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [CustomerCreationService, CustomerLookupService, CustomerResolver],
  adminApiExtensions: {
    schema: CUSTOMER_SCHEMA,
    resolvers: [CustomerResolver],
  },
  shopApiExtensions: {
    schema: CUSTOMER_SCHEMA,
    resolvers: [CustomerResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class CustomerPlugin implements OnModuleInit {
  onModuleInit() {
    // Plugin initialization
  }
}

/**
 * Customer Admin Plugin
 *
 * Separate plugin (same split as AuditCorePlugin/AuditPlugin) because any
 * resolver listed in a plugin's providers leaks into BOTH the shop and admin
 * schema builds whenever the plugin declares shopApiExtensions. Admin-only
 * resolvers must therefore live in a plugin without shopApiExtensions.
 * Must be registered in vendure-config next to CustomerPlugin.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [CustomerLifecycleService, CustomerAdminResolver],
  adminApiExtensions: {
    schema: CUSTOMER_ADMIN_SCHEMA,
    resolvers: [CustomerAdminResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class CustomerAdminPlugin {}
