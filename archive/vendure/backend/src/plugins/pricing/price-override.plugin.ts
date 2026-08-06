import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { CustomPriceCalculationStrategy } from './custom-price-calculation.strategy';
import { PriceOverrideResolver } from './price-override.resolver';
import { PriceOverrideService } from '../../services/orders/price-override.service';

const schemaExtension = gql`
  extend type Mutation {
    setOrderLineCustomPrice(input: SetOrderLineCustomPriceInput!): SetOrderLineCustomPriceResult!
  }

  input SetOrderLineCustomPriceInput {
    orderLineId: ID!
    customLinePrice: Int!
    reason: String
  }

  union SetOrderLineCustomPriceResult = OrderLine | Error

  type Error {
    errorCode: ErrorCode!
    message: String!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [PriceOverrideService, CustomPriceCalculationStrategy],
  adminApiExtensions: {
    schema: schemaExtension,
    resolvers: [PriceOverrideResolver],
  },
  configuration: config => {
    config.orderOptions.orderItemPriceCalculationStrategy = new CustomPriceCalculationStrategy();
    return config;
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class PriceOverridePlugin {}
