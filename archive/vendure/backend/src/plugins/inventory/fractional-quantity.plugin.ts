import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { gql } from 'graphql-tag';
import { VENDURE_COMPATIBILITY_VERSION } from '../../constants/vendure-version.constants';
import { FractionalQuantityResolver } from './fractional-quantity.resolver';

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [],
  adminApiExtensions: {
    schema: gql`
      extend type Mutation {
        updateOrderLineQuantity(orderLineId: ID!, quantity: Float!): UpdateOrderItemsResult!
      }
    `,
    resolvers: [FractionalQuantityResolver],
  },
  compatibility: VENDURE_COMPATIBILITY_VERSION,
})
export class FractionalQuantityPlugin {}
