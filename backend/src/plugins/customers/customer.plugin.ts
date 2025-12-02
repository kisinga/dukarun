import { OnModuleInit } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { gql } from 'graphql-tag';
import { CustomerResolver } from './customer.resolver';
import { CustomerLookupService } from '../../services/customers/customer-lookup.service';

const CUSTOMER_SCHEMA = gql`
  extend type Mutation {
    """
    Create a customer with duplicate prevention by phone number.
    If a customer with the same phone number exists, returns the existing customer.
    This is a safety net - the frontend should also check for duplicates.
    """
    createCustomerSafe(input: CreateCustomerInput!): Customer!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [CustomerLookupService, CustomerResolver],
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
