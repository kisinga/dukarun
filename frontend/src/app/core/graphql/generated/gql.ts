/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  '\n  mutation UpdateOrderLineQuantity($orderLineId: ID!, $quantity: Float!) {\n    updateOrderLineQuantity(orderLineId: $orderLineId, quantity: $quantity) {\n      ... on Order {\n        id\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            customFields {\n              allowFractionalQuantity\n            }\n          }\n        }\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.UpdateOrderLineQuantityDocument;
  '\n  query GetActiveAdministrator {\n    activeAdministrator {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n': typeof types.GetActiveAdministratorDocument;
  '\n  mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $username, password: $password, rememberMe: $rememberMe) {\n      ... on CurrentUser {\n        id\n        identifier\n        channels {\n          id\n          code\n          token\n        }\n      }\n      ... on InvalidCredentialsError {\n        errorCode\n        message\n      }\n      ... on NativeAuthStrategyError {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.LoginDocument;
  '\n  mutation RequestRegistrationOTP($phoneNumber: String!, $registrationData: RegistrationInput!) {\n    requestRegistrationOTP(phoneNumber: $phoneNumber, registrationData: $registrationData) {\n      success\n      message\n      sessionId\n      expiresAt\n    }\n  }\n': typeof types.RequestRegistrationOtpDocument;
  '\n  mutation VerifyRegistrationOTP($phoneNumber: String!, $otp: String!, $sessionId: String!) {\n    verifyRegistrationOTP(phoneNumber: $phoneNumber, otp: $otp, sessionId: $sessionId) {\n      success\n      userId\n      message\n    }\n  }\n': typeof types.VerifyRegistrationOtpDocument;
  '\n  mutation RequestLoginOTP($phoneNumber: String!) {\n    requestLoginOTP(phoneNumber: $phoneNumber) {\n      success\n      message\n      expiresAt\n    }\n  }\n': typeof types.RequestLoginOtpDocument;
  '\n  mutation VerifyLoginOTP($phoneNumber: String!, $otp: String!) {\n    verifyLoginOTP(phoneNumber: $phoneNumber, otp: $otp) {\n      success\n      token\n      user {\n        id\n        identifier\n      }\n      message\n    }\n  }\n': typeof types.VerifyLoginOtpDocument;
  '\n  query CheckAuthorizationStatus($identifier: String!) {\n    checkAuthorizationStatus(identifier: $identifier) {\n      status\n      message\n    }\n  }\n': typeof types.CheckAuthorizationStatusDocument;
  '\n  query CheckCompanyCodeAvailability($companyCode: String!) {\n    checkCompanyCodeAvailability(companyCode: $companyCode)\n  }\n': typeof types.CheckCompanyCodeAvailabilityDocument;
  '\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n': typeof types.LogoutDocument;
  '\n  mutation UpdateAdministrator($input: UpdateActiveAdministratorInput!) {\n    updateActiveAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n': typeof types.UpdateAdministratorDocument;
  '\n  mutation UpdateAdminProfile($input: UpdateAdminProfileInput!) {\n    updateAdminProfile(input: $input) {\n      id\n      firstName\n      lastName\n    }\n  }\n': typeof types.UpdateAdminProfileDocument;
  '\n  query GetUserChannels {\n    me {\n      id\n      identifier\n      channels {\n        id\n        code\n        token\n      }\n    }\n  }\n': typeof types.GetUserChannelsDocument;
  '\n  query GetActiveChannel {\n    activeChannel {\n      id\n      code\n      token\n      defaultCurrencyCode\n      customFields {\n        mlModelJsonAsset {\n          id\n          source\n          name\n        }\n        mlModelBinAsset {\n          id\n          source\n          name\n        }\n        mlMetadataAsset {\n          id\n          source\n          name\n        }\n        companyLogoAsset {\n          id\n          source\n          name\n          preview\n        }\n        cashierFlowEnabled\n        enablePrinter\n        subscriptionStatus\n        trialEndsAt\n        subscriptionExpiresAt\n      }\n    }\n  }\n': typeof types.GetActiveChannelDocument;
  '\n  query GetStockLocations {\n    stockLocations(options: { take: 100 }) {\n      items {\n        id\n        name\n        description\n      }\n    }\n  }\n': typeof types.GetStockLocationsDocument;
  '\n  query CheckSkuExists($sku: String!) {\n    productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {\n      items {\n        id\n        sku\n        product {\n          id\n          name\n        }\n      }\n    }\n  }\n': typeof types.CheckSkuExistsDocument;
  '\n  query CheckBarcodeExists($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n      }\n    }\n  }\n': typeof types.CheckBarcodeExistsDocument;
  '\n  mutation CreateProduct($input: CreateProductInput!) {\n    createProduct(input: $input) {\n      id\n      name\n      slug\n      description\n      enabled\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        stockOnHand\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n': typeof types.CreateProductDocument;
  '\n  mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {\n    createProductVariants(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n': typeof types.CreateProductVariantsDocument;
  '\n  mutation DeleteProductVariants($ids: [ID!]!) {\n    deleteProductVariants(ids: $ids) {\n      result\n      message\n    }\n  }\n': typeof types.DeleteProductVariantsDocument;
  '\n  mutation CreateAssets($input: [CreateAssetInput!]!) {\n    createAssets(input: $input) {\n      ... on Asset {\n        id\n        name\n        preview\n        source\n      }\n    }\n  }\n': typeof types.CreateAssetsDocument;
  '\n  mutation AssignAssetsToProduct($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n': typeof types.AssignAssetsToProductDocument;
  '\n  mutation AssignAssetsToChannel($assetIds: [ID!]!, $channelId: ID!) {\n    assignAssetsToChannel(input: { assetIds: $assetIds, channelId: $channelId }) {\n      id\n      name\n    }\n  }\n': typeof types.AssignAssetsToChannelDocument;
  '\n  mutation DeleteAsset($input: DeleteAssetInput!) {\n    deleteAsset(input: $input) {\n      result\n      message\n    }\n  }\n': typeof types.DeleteAssetDocument;
  '\n  mutation UpdateProductAssets($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n': typeof types.UpdateProductAssetsDocument;
  '\n  query GetProductDetail($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      slug\n      description\n      enabled\n      customFields {\n        barcode\n      }\n      facetValues {\n        id\n        name\n        code\n        facet {\n          id\n          code\n        }\n      }\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        stockOnHand\n        trackInventory\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          id\n          stockOnHand\n          stockLocation {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n': typeof types.GetProductDetailDocument;
  '\n  query GetProducts($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        description\n        enabled\n        featuredAsset {\n          id\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n': typeof types.GetProductsDocument;
  '\n  mutation DeleteProduct($id: ID!) {\n    deleteProduct(id: $id) {\n      result\n      message\n    }\n  }\n': typeof types.DeleteProductDocument;
  '\n  mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!) {\n    createProductOptionGroup(input: $input) {\n      id\n      code\n      name\n      options {\n        id\n        code\n        name\n      }\n    }\n  }\n': typeof types.CreateProductOptionGroupDocument;
  '\n  mutation CreateProductOption($input: CreateProductOptionInput!) {\n    createProductOption(input: $input) {\n      id\n      code\n      name\n      group {\n        id\n        name\n      }\n    }\n  }\n': typeof types.CreateProductOptionDocument;
  '\n  mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {\n    addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {\n      id\n      name\n      optionGroups {\n        id\n        code\n        name\n        options {\n          id\n          code\n          name\n        }\n      }\n    }\n  }\n': typeof types.AddOptionGroupToProductDocument;
  '\n  mutation UpdateProductVariant($input: UpdateProductVariantInput!) {\n    updateProductVariant(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n': typeof types.UpdateProductVariantDocument;
  '\n  query SearchProducts($term: String!) {\n    products(options: { filter: { name: { contains: $term } }, take: 5 }) {\n      items {\n        id\n        name\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n': typeof types.SearchProductsDocument;
  '\n  query GetProduct($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      featuredAsset {\n        preview\n      }\n      facetValues {\n        id\n        name\n        facet {\n          code\n        }\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        trackInventory\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          stockLocationId\n          stockOnHand\n        }\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n': typeof types.GetProductDocument;
  '\n  query GetVariantStockLevel($variantId: ID!) {\n    productVariant(id: $variantId) {\n      id\n      name\n      sku\n      stockOnHand\n      stockLevels {\n        id\n        stockOnHand\n        stockLocation {\n          id\n          name\n        }\n      }\n    }\n  }\n': typeof types.GetVariantStockLevelDocument;
  '\n  query SearchByBarcode($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n        }\n      }\n    }\n  }\n': typeof types.SearchByBarcodeDocument;
  '\n  query PrefetchProducts($take: Int!, $skip: Int) {\n    products(options: { take: $take, skip: $skip }) {\n      totalItems\n      items {\n        id\n        name\n        enabled\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n': typeof types.PrefetchProductsDocument;
  '\n  query GetFacetsByCodes($codes: [String!]!) {\n    facets(options: { filter: { code: { in: $codes } }, take: 10 }) {\n      items {\n        id\n        code\n        name\n      }\n    }\n  }\n': typeof types.GetFacetsByCodesDocument;
  '\n  query GetFacetValues($facetId: String!, $term: String) {\n    facetValues(\n      options: { filter: { facetId: { eq: $facetId }, name: { contains: $term } }, take: 20 }\n    ) {\n      items {\n        id\n        name\n        code\n      }\n    }\n  }\n': typeof types.GetFacetValuesDocument;
  '\n  mutation CreateFacet($input: CreateFacetInput!) {\n    createFacet(input: $input) {\n      id\n      code\n      name\n    }\n  }\n': typeof types.CreateFacetDocument;
  '\n  mutation CreateFacetValue($input: CreateFacetValueInput!) {\n    createFacetValue(input: $input) {\n      id\n      name\n      code\n    }\n  }\n': typeof types.CreateFacetValueDocument;
  '\n  query GetOrdersForPeriod($startDate: DateTime!) {\n    orders(options: { filter: { orderPlacedAt: { after: $startDate } }, take: 100 }) {\n      items {\n        id\n        total\n        totalWithTax\n        orderPlacedAt\n        state\n        payments {\n          id\n          amount\n          method\n          state\n        }\n      }\n    }\n  }\n': typeof types.GetOrdersForPeriodDocument;
  '\n  query GetDashboardStats($startDate: DateTime, $endDate: DateTime) {\n    dashboardStats(startDate: $startDate, endDate: $endDate) {\n      sales {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      purchases {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      expenses {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      salesSummary {\n        today {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        week {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        month {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n      }\n    }\n  }\n': typeof types.GetDashboardStatsDocument;
  '\n  query GetStockValueStats($stockLocationId: ID, $forceRefresh: Boolean) {\n    stockValueStats(stockLocationId: $stockLocationId, forceRefresh: $forceRefresh) {\n      retail\n      wholesale\n      cost\n    }\n  }\n': typeof types.GetStockValueStatsDocument;
  '\n  query GetProductStats {\n    products(options: { take: 1 }) {\n      totalItems\n    }\n    productVariants(options: { take: 1 }) {\n      totalItems\n    }\n  }\n': typeof types.GetProductStatsDocument;
  '\n  query GetRecentOrders {\n    orders(options: { take: 10, sort: { createdAt: DESC } }) {\n      items {\n        id\n        code\n        total\n        totalWithTax\n        state\n        createdAt\n        orderPlacedAt\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            sku\n            product {\n              id\n              name\n            }\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n      }\n    }\n  }\n': typeof types.GetRecentOrdersDocument;
  '\n  mutation CreateDraftOrder {\n    createDraftOrder {\n      id\n      code\n      state\n      total\n      totalWithTax\n    }\n  }\n': typeof types.CreateDraftOrderDocument;
  '\n  mutation CreateOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        metadata\n      }\n    }\n  }\n': typeof types.CreateOrderDocument;
  '\n  mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {\n    addItemToDraftOrder(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n': typeof types.AddItemToDraftOrderDocument;
  '\n  mutation RemoveDraftOrderLine($orderId: ID!, $orderLineId: ID!) {\n    removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n': typeof types.RemoveDraftOrderLineDocument;
  '\n  mutation AdjustDraftOrderLine($orderId: ID!, $input: AdjustDraftOrderLineInput!) {\n    adjustDraftOrderLine(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n': typeof types.AdjustDraftOrderLineDocument;
  '\n  mutation AddManualPaymentToOrder($input: ManualPaymentInput!) {\n    addManualPaymentToOrder(input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        payments {\n          id\n          state\n          amount\n          method\n          metadata\n        }\n      }\n      ... on ManualPaymentStateError {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.AddManualPaymentToOrderDocument;
  '\n  mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {\n    setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetCustomerForDraftOrderDocument;
  '\n  mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {\n    setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        shippingLines {\n          id\n          shippingMethod {\n            id\n            name\n            code\n          }\n        }\n      }\n      ... on OrderModificationError {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetDraftOrderShippingMethodDocument;
  '\n  mutation SetDraftOrderBillingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderBillingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      billingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n': typeof types.SetDraftOrderBillingAddressDocument;
  '\n  mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderShippingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      shippingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n': typeof types.SetDraftOrderShippingAddressDocument;
  '\n  mutation TransitionOrderToState($id: ID!, $state: String!) {\n    transitionOrderToState(id: $id, state: $state) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n': typeof types.TransitionOrderToStateDocument;
  '\n  mutation VoidOrder($orderId: ID!) {\n    voidOrder(orderId: $orderId) {\n      order {\n        id\n        code\n        state\n      }\n      hadPayments\n    }\n  }\n': typeof types.VoidOrderDocument;
  '\n  mutation AddFulfillmentToOrder($input: FulfillOrderInput!) {\n    addFulfillmentToOrder(input: $input) {\n      ... on Fulfillment {\n        id\n        state\n        nextStates\n        createdAt\n        updatedAt\n        method\n        lines {\n          orderLineId\n          quantity\n        }\n        trackingCode\n      }\n      ... on CreateFulfillmentError {\n        errorCode\n        message\n        fulfillmentHandlerError\n      }\n      ... on FulfillmentStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n': typeof types.AddFulfillmentToOrderDocument;
  '\n  query GetPaymentMethods {\n    paymentMethods(options: { take: 100 }) {\n      items {\n        id\n        code\n        name\n        description\n        enabled\n        customFields {\n          imageAsset {\n            id\n            source\n            name\n            preview\n          }\n          isActive\n        }\n      }\n    }\n  }\n': typeof types.GetPaymentMethodsDocument;
  '\n  query GetOrderDetails($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      lines {\n        id\n        quantity\n        productVariant {\n          id\n          name\n          sku\n        }\n      }\n    }\n  }\n': typeof types.GetOrderDetailsDocument;
  '\n  query GetOrder($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n    }\n  }\n': typeof types.GetOrderDocument;
  '\n  query GetOrders($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        updatedAt\n        orderPlacedAt\n        total\n        totalWithTax\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n            sku\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n        customFields {\n          reversedAt\n        }\n      }\n      totalItems\n    }\n  }\n': typeof types.GetOrdersDocument;
  '\n  query GetPayments($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        orderPlacedAt\n        payments {\n          id\n          state\n          amount\n          method\n          transactionId\n          createdAt\n          updatedAt\n          errorMessage\n          metadata\n        }\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      totalItems\n    }\n  }\n': typeof types.GetPaymentsDocument;
  '\n  query GetPaymentFull($orderId: ID!) {\n    order(id: $orderId) {\n      id\n      code\n      state\n      createdAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        transactionId\n        createdAt\n        updatedAt\n        errorMessage\n        metadata\n        nextStates\n        refunds {\n          id\n          total\n          state\n          reason\n          createdAt\n        }\n      }\n    }\n  }\n': typeof types.GetPaymentFullDocument;
  '\n  query GetOrderFull($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      createdAt\n      updatedAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        createdAt\n        metadata\n      }\n      customFields {\n        reversedAt\n      }\n      fulfillments {\n        id\n        state\n        method\n        trackingCode\n        createdAt\n        updatedAt\n      }\n      billingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n      shippingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n    }\n  }\n': typeof types.GetOrderFullDocument;
  '\n  query GetMlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n    }\n  }\n': typeof types.GetMlTrainingInfoDocument;
  '\n  query GetMlTrainingManifest($channelId: ID!) {\n    mlTrainingManifest(channelId: $channelId) {\n      channelId\n      version\n      extractedAt\n      products {\n        productId\n        productName\n        images {\n          assetId\n          url\n          filename\n        }\n      }\n    }\n  }\n': typeof types.GetMlTrainingManifestDocument;
  '\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n': typeof types.ExtractPhotosForTrainingDocument;
  '\n  mutation UpdateTrainingStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {\n    updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)\n  }\n': typeof types.UpdateTrainingStatusDocument;
  '\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n': typeof types.StartTrainingDocument;
  '\n  mutation CompleteTraining(\n    $channelId: ID!\n    $modelJson: Upload!\n    $weightsFile: Upload!\n    $metadata: Upload!\n  ) {\n    completeTraining(\n      channelId: $channelId\n      modelJson: $modelJson\n      weightsFile: $weightsFile\n      metadata: $metadata\n    )\n  }\n': typeof types.CompleteTrainingDocument;
  '\n  query GetCustomers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        outstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          lastRepaymentDate\n          lastRepaymentAmount\n          creditDuration\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n        user {\n          id\n          identifier\n          verified\n        }\n      }\n    }\n  }\n': typeof types.GetCustomersDocument;
  '\n  query GetCountries($options: CountryListOptions) {\n    countries(options: $options) {\n      totalItems\n      items {\n        id\n        code\n        name\n        enabled\n      }\n    }\n  }\n': typeof types.GetCountriesDocument;
  '\n  query GetCustomer($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      outstandingAmount\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n      user {\n        id\n        identifier\n        verified\n      }\n    }\n  }\n': typeof types.GetCustomerDocument;
  '\n  mutation CreateCustomer($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n      }\n    }\n  }\n': typeof types.CreateCustomerDocument;
  '\n  mutation UpdateCustomer($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.UpdateCustomerDocument;
  '\n  mutation DeleteCustomer($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n': typeof types.DeleteCustomerDocument;
  '\n  mutation CreateCustomerAddress($customerId: ID!, $input: CreateAddressInput!) {\n    createCustomerAddress(customerId: $customerId, input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n': typeof types.CreateCustomerAddressDocument;
  '\n  mutation UpdateCustomerAddress($input: UpdateAddressInput!) {\n    updateCustomerAddress(input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n': typeof types.UpdateCustomerAddressDocument;
  '\n  mutation DeleteCustomerAddress($id: ID!) {\n    deleteCustomerAddress(id: $id) {\n      success\n    }\n  }\n': typeof types.DeleteCustomerAddressDocument;
  '\n  query GetCreditSummary($customerId: ID!) {\n    creditSummary(customerId: $customerId) {\n      customerId\n      isCreditApproved\n      creditFrozen\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n': typeof types.GetCreditSummaryDocument;
  '\n  query ValidateCredit($input: ValidateCreditInput!) {\n    validateCredit(input: $input) {\n      isValid\n      error\n      availableCredit\n      estimatedOrderTotal\n      wouldExceedLimit\n    }\n  }\n': typeof types.ValidateCreditDocument;
  '\n  mutation ApproveCustomerCredit($input: ApproveCustomerCreditInput!) {\n    approveCustomerCredit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n': typeof types.ApproveCustomerCreditDocument;
  '\n  mutation UpdateCustomerCreditLimit($input: UpdateCustomerCreditLimitInput!) {\n    updateCustomerCreditLimit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n': typeof types.UpdateCustomerCreditLimitDocument;
  '\n  mutation UpdateCreditDuration($input: UpdateCreditDurationInput!) {\n    updateCreditDuration(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n': typeof types.UpdateCreditDurationDocument;
  '\n  query GetUnpaidOrdersForCustomer($customerId: ID!) {\n    unpaidOrdersForCustomer(customerId: $customerId) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      createdAt\n      payments {\n        id\n        state\n        amount\n        method\n      }\n    }\n  }\n': typeof types.GetUnpaidOrdersForCustomerDocument;
  '\n  mutation AllocateBulkPayment($input: PaymentAllocationInput!) {\n    allocateBulkPayment(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n': typeof types.AllocateBulkPaymentDocument;
  '\n  mutation PaySingleOrder($input: PaySingleOrderInput!) {\n    paySingleOrder(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n': typeof types.PaySingleOrderDocument;
  '\n  mutation PaySinglePurchase($input: PaySinglePurchaseInput!) {\n    paySinglePurchase(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n': typeof types.PaySinglePurchaseDocument;
  '\n  query GetSupplierCreditSummary($supplierId: ID!) {\n    supplierCreditSummary(supplierId: $supplierId) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n': typeof types.GetSupplierCreditSummaryDocument;
  '\n  mutation ApproveSupplierCredit($input: ApproveSupplierCreditInput!) {\n    approveSupplierCredit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n': typeof types.ApproveSupplierCreditDocument;
  '\n  mutation UpdateSupplierCreditLimit($input: UpdateSupplierCreditLimitInput!) {\n    updateSupplierCreditLimit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n': typeof types.UpdateSupplierCreditLimitDocument;
  '\n  mutation UpdateSupplierCreditDuration($input: UpdateSupplierCreditDurationInput!) {\n    updateSupplierCreditDuration(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n': typeof types.UpdateSupplierCreditDurationDocument;
  '\n  mutation AllocateBulkSupplierPayment($input: SupplierPaymentAllocationInput!) {\n    allocateBulkSupplierPayment(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n': typeof types.AllocateBulkSupplierPaymentDocument;
  '\n  mutation SetOrderLineCustomPrice($input: SetOrderLineCustomPriceInput!) {\n    setOrderLineCustomPrice(input: $input) {\n      ... on OrderLine {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        customFields {\n          customLinePrice\n          priceOverrideReason\n        }\n        productVariant {\n          id\n          name\n          price\n        }\n      }\n      ... on Error {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.SetOrderLineCustomPriceDocument;
  '\n  query GetSuppliers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        supplierOutstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n          isSupplierCreditApproved\n          supplierCreditLimit\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n      }\n    }\n  }\n': typeof types.GetSuppliersDocument;
  '\n  query GetSupplier($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n    }\n  }\n': typeof types.GetSupplierDocument;
  '\n  mutation CreateSupplier($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        creditDuration\n      }\n    }\n  }\n': typeof types.CreateSupplierDocument;
  '\n  mutation UpdateSupplier($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n': typeof types.UpdateSupplierDocument;
  '\n  mutation DeleteSupplier($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n': typeof types.DeleteSupplierDocument;
  '\n  mutation UpdateChannelLogo($logoAssetId: ID) {\n    updateChannelLogo(logoAssetId: $logoAssetId) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n': typeof types.UpdateChannelLogoDocument;
  '\n  mutation UpdateCashierSettings($cashierFlowEnabled: Boolean) {\n    updateCashierSettings(cashierFlowEnabled: $cashierFlowEnabled) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n': typeof types.UpdateCashierSettingsDocument;
  '\n  mutation UpdatePrinterSettings($enablePrinter: Boolean!) {\n    updatePrinterSettings(enablePrinter: $enablePrinter) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n': typeof types.UpdatePrinterSettingsDocument;
  '\n  mutation InviteChannelAdministrator($input: InviteAdministratorInput!) {\n    inviteChannelAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n': typeof types.InviteChannelAdministratorDocument;
  '\n  query GetRoleTemplates {\n    roleTemplates {\n      code\n      name\n      description\n      permissions\n    }\n  }\n': typeof types.GetRoleTemplatesDocument;
  '\n  mutation CreateChannelAdmin($input: CreateChannelAdminInput!) {\n    createChannelAdmin(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n': typeof types.CreateChannelAdminDocument;
  '\n  mutation UpdateChannelAdmin($id: ID!, $permissions: [String!]!) {\n    updateChannelAdmin(id: $id, permissions: $permissions) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n': typeof types.UpdateChannelAdminDocument;
  '\n  mutation DisableChannelAdmin($id: ID!) {\n    disableChannelAdmin(id: $id) {\n      success\n      message\n    }\n  }\n': typeof types.DisableChannelAdminDocument;
  '\n  query GetAdministrators($options: AdministratorListOptions) {\n    administrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        user {\n          id\n          identifier\n          verified\n          roles {\n            id\n            code\n            permissions\n            channels {\n              id\n            }\n          }\n        }\n      }\n    }\n  }\n': typeof types.GetAdministratorsDocument;
  '\n  query GetAdministratorById($id: ID!) {\n    administrator(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n': typeof types.GetAdministratorByIdDocument;
  '\n  query GetAdministratorByUserId($userId: ID!) {\n    administratorByUserId(userId: $userId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n': typeof types.GetAdministratorByUserIdDocument;
  '\n  mutation CreateChannelPaymentMethod($input: CreatePaymentMethodInput!) {\n    createChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n    }\n  }\n': typeof types.CreateChannelPaymentMethodDocument;
  '\n  mutation UpdateChannelPaymentMethod($input: UpdatePaymentMethodInput!) {\n    updateChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n      customFields {\n        imageAsset {\n          id\n          preview\n        }\n        isActive\n      }\n    }\n  }\n': typeof types.UpdateChannelPaymentMethodDocument;
  '\n  query GetAuditLogs($options: AuditLogOptions) {\n    auditLogs(options: $options) {\n      id\n      timestamp\n      channelId\n      eventType\n      entityType\n      entityId\n      userId\n      data\n      source\n    }\n  }\n': typeof types.GetAuditLogsDocument;
  '\n  query GetUserNotifications($options: NotificationListOptions) {\n    getUserNotifications(options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        data\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n': typeof types.GetUserNotificationsDocument;
  '\n  query GetUnreadCount {\n    getUnreadCount\n  }\n': typeof types.GetUnreadCountDocument;
  '\n  mutation MarkNotificationAsRead($id: ID!) {\n    markNotificationAsRead(id: $id)\n  }\n': typeof types.MarkNotificationAsReadDocument;
  '\n  mutation MarkAllAsRead {\n    markAllAsRead\n  }\n': typeof types.MarkAllAsReadDocument;
  '\n  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {\n    subscribeToPush(subscription: $subscription)\n  }\n': typeof types.SubscribeToPushDocument;
  '\n  mutation UnsubscribeToPush {\n    unsubscribeToPush\n  }\n': typeof types.UnsubscribeToPushDocument;
  '\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.GetSubscriptionTiersDocument;
  '\n  query GetChannelSubscription($channelId: ID) {\n    getChannelSubscription(channelId: $channelId) {\n      tier {\n        id\n        code\n        name\n        description\n        priceMonthly\n        priceYearly\n        features\n      }\n      status\n      trialEndsAt\n      subscriptionStartedAt\n      subscriptionExpiresAt\n      billingCycle\n      lastPaymentDate\n      lastPaymentAmount\n    }\n  }\n': typeof types.GetChannelSubscriptionDocument;
  '\n  query CheckSubscriptionStatus($channelId: ID) {\n    checkSubscriptionStatus(channelId: $channelId) {\n      isValid\n      status\n      daysRemaining\n      expiresAt\n      trialEndsAt\n      canPerformAction\n    }\n  }\n': typeof types.CheckSubscriptionStatusDocument;
  '\n  mutation InitiateSubscriptionPurchase(\n    $channelId: ID!\n    $tierId: String!\n    $billingCycle: String!\n    $phoneNumber: String!\n    $email: String!\n    $paymentMethod: String\n  ) {\n    initiateSubscriptionPurchase(\n      channelId: $channelId\n      tierId: $tierId\n      billingCycle: $billingCycle\n      phoneNumber: $phoneNumber\n      email: $email\n      paymentMethod: $paymentMethod\n    ) {\n      success\n      reference\n      authorizationUrl\n      message\n    }\n  }\n': typeof types.InitiateSubscriptionPurchaseDocument;
  '\n  mutation VerifySubscriptionPayment($channelId: ID!, $reference: String!) {\n    verifySubscriptionPayment(channelId: $channelId, reference: $reference)\n  }\n': typeof types.VerifySubscriptionPaymentDocument;
  '\n  mutation CancelSubscription($channelId: ID!) {\n    cancelSubscription(channelId: $channelId)\n  }\n': typeof types.CancelSubscriptionDocument;
  '\n  mutation RecordPurchase($input: RecordPurchaseInput!) {\n    recordPurchase(input: $input) {\n      id\n      supplierId\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.RecordPurchaseDocument;
  '\n  query GetPurchases($options: PurchaseListOptions) {\n    purchases(options: $options) {\n      items {\n        id\n        supplierId\n        status\n        supplier {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        purchaseDate\n        referenceNumber\n        totalCost\n        paymentStatus\n        isCreditPurchase\n        notes\n        lines {\n          id\n          variantId\n          variant {\n            id\n            name\n            product {\n              id\n              name\n            }\n          }\n          quantity\n          unitCost\n          totalCost\n          stockLocationId\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n': typeof types.GetPurchasesDocument;
  '\n  query GetPurchase($id: ID!) {\n    purchase(id: $id) {\n      id\n      supplierId\n      status\n      supplier {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      isCreditPurchase\n      notes\n      lines {\n        id\n        variantId\n        variant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n        stockLocation {\n          id\n          name\n        }\n      }\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.GetPurchaseDocument;
  '\n  mutation ConfirmPurchase($id: ID!) {\n    confirmPurchase(id: $id) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      paymentStatus\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n': typeof types.ConfirmPurchaseDocument;
  '\n  mutation UpdateDraftPurchase($id: ID!, $input: UpdateDraftPurchaseInput!) {\n    updateDraftPurchase(id: $id, input: $input) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n': typeof types.UpdateDraftPurchaseDocument;
  '\n  mutation RecordStockAdjustment($input: RecordStockAdjustmentInput!) {\n    recordStockAdjustment(input: $input) {\n      id\n      reason\n      notes\n      adjustedByUserId\n      lines {\n        id\n        variantId\n        quantityChange\n        previousStock\n        newStock\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.RecordStockAdjustmentDocument;
  '\n  query GetStockAdjustments($options: StockAdjustmentListOptions) {\n    stockAdjustments(options: $options) {\n      items {\n        id\n        reason\n        notes\n        adjustedByUserId\n        lines {\n          id\n          variantId\n          quantityChange\n          previousStock\n          newStock\n          stockLocationId\n          variant {\n            id\n            name\n            sku\n            product {\n              name\n            }\n          }\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n': typeof types.GetStockAdjustmentsDocument;
  '\n  query GetLedgerAccounts {\n    ledgerAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n': typeof types.GetLedgerAccountsDocument;
  '\n  query GetEligibleDebitAccounts {\n    eligibleDebitAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n': typeof types.GetEligibleDebitAccountsDocument;
  '\n  mutation RecordExpense($input: RecordExpenseInput!) {\n    recordExpense(input: $input) {\n      sourceId\n    }\n  }\n': typeof types.RecordExpenseDocument;
  '\n  mutation CreateInterAccountTransfer($input: InterAccountTransferInput!) {\n    createInterAccountTransfer(input: $input) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n': typeof types.CreateInterAccountTransferDocument;
  '\n  query GetJournalEntries($options: JournalEntriesOptions) {\n    journalEntries(options: $options) {\n      items {\n        id\n        entryDate\n        postedAt\n        sourceType\n        sourceId\n        memo\n        lines {\n          id\n          accountCode\n          accountName\n          debit\n          credit\n          meta\n        }\n      }\n      totalItems\n    }\n  }\n': typeof types.GetJournalEntriesDocument;
  '\n  query GetJournalEntry($id: ID!) {\n    journalEntry(id: $id) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n': typeof types.GetJournalEntryDocument;
  '\n  query GetChannelReconciliationConfig($channelId: Int!) {\n    channelReconciliationConfig(channelId: $channelId) {\n      paymentMethodId\n      paymentMethodCode\n      reconciliationType\n      ledgerAccountCode\n      isCashierControlled\n      requiresReconciliation\n    }\n  }\n': typeof types.GetChannelReconciliationConfigDocument;
  '\n  query GetShiftModalPrefillData($channelId: Int!) {\n    shiftModalPrefillData(channelId: $channelId) {\n      config {\n        paymentMethodId\n        paymentMethodCode\n        reconciliationType\n        ledgerAccountCode\n        isCashierControlled\n        requiresReconciliation\n      }\n      balances {\n        accountCode\n        accountName\n        balanceCents\n      }\n    }\n  }\n': typeof types.GetShiftModalPrefillDataDocument;
  '\n  query GetCurrentCashierSession($channelId: Int!) {\n    currentCashierSession(channelId: $channelId) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      closedAt\n      closingDeclared\n      status\n    }\n  }\n': typeof types.GetCurrentCashierSessionDocument;
  '\n  query GetCashierSession($sessionId: String!) {\n    cashierSession(sessionId: $sessionId) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n': typeof types.GetCashierSessionDocument;
  '\n  query GetCashierSessions($channelId: Int!, $options: CashierSessionListOptions) {\n    cashierSessions(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        cashierUserId\n        openedAt\n        closedAt\n        closingDeclared\n        status\n      }\n      totalItems\n    }\n  }\n': typeof types.GetCashierSessionsDocument;
  '\n  mutation OpenCashierSession($input: OpenCashierSessionInput!) {\n    openCashierSession(input: $input) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      status\n    }\n  }\n': typeof types.OpenCashierSessionDocument;
  '\n  mutation CloseCashierSession($input: CloseCashierSessionInput!) {\n    closeCashierSession(input: $input) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n': typeof types.CloseCashierSessionDocument;
  '\n  mutation CreateCashierSessionReconciliation($sessionId: String!, $notes: String) {\n    createCashierSessionReconciliation(sessionId: $sessionId, notes: $notes) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n': typeof types.CreateCashierSessionReconciliationDocument;
  '\n  mutation CreateReconciliation($input: CreateReconciliationInput!) {\n    createReconciliation(input: $input) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n': typeof types.CreateReconciliationDocument;
  '\n  query GetReconciliations($channelId: Int!, $options: ReconciliationListOptions) {\n    reconciliations(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        scope\n        scopeRefId\n        snapshotAt\n        status\n        expectedBalance\n        actualBalance\n        varianceAmount\n        notes\n        createdBy\n      }\n      totalItems\n    }\n  }\n': typeof types.GetReconciliationsDocument;
  '\n  query GetReconciliationDetails($reconciliationId: String!) {\n    reconciliationDetails(reconciliationId: $reconciliationId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n': typeof types.GetReconciliationDetailsDocument;
  '\n  query GetSessionReconciliationDetails($sessionId: String!, $kind: String, $channelId: Int) {\n    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind, channelId: $channelId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n': typeof types.GetSessionReconciliationDetailsDocument;
  '\n  query GetAccountBalancesAsOf($channelId: Int!, $asOfDate: String!) {\n    accountBalancesAsOf(channelId: $channelId, asOfDate: $asOfDate) {\n      accountId\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n': typeof types.GetAccountBalancesAsOfDocument;
  '\n  query GetLastClosedSessionClosingBalances($channelId: Int!) {\n    lastClosedSessionClosingBalances(channelId: $channelId) {\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n': typeof types.GetLastClosedSessionClosingBalancesDocument;
  '\n  query GetExpectedSessionClosingBalances($sessionId: String!) {\n    expectedSessionClosingBalances(sessionId: $sessionId) {\n      accountCode\n      accountName\n      expectedBalanceCents\n    }\n  }\n': typeof types.GetExpectedSessionClosingBalancesDocument;
  '\n  query GetSessionCashCounts($sessionId: String!) {\n    sessionCashCounts(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n      countedByUserId\n    }\n  }\n': typeof types.GetSessionCashCountsDocument;
  '\n  query GetPendingVarianceReviews($channelId: Int!) {\n    pendingVarianceReviews(channelId: $channelId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      countedByUserId\n    }\n  }\n': typeof types.GetPendingVarianceReviewsDocument;
  '\n  query GetSessionMpesaVerifications($sessionId: String!) {\n    sessionMpesaVerifications(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n      verifiedByUserId\n    }\n  }\n': typeof types.GetSessionMpesaVerificationsDocument;
  '\n  mutation RecordCashCount($input: RecordCashCountInput!) {\n    recordCashCount(input: $input) {\n      count {\n        id\n        sessionId\n        countType\n        takenAt\n        declaredCash\n        varianceReason\n        countedByUserId\n      }\n      hasVariance\n      varianceHidden\n    }\n  }\n': typeof types.RecordCashCountDocument;
  '\n  mutation ExplainVariance($countId: String!, $reason: String!) {\n    explainVariance(countId: $countId, reason: $reason) {\n      id\n      varianceReason\n    }\n  }\n': typeof types.ExplainVarianceDocument;
  '\n  mutation ReviewCashCount($countId: String!, $notes: String) {\n    reviewCashCount(countId: $countId, notes: $notes) {\n      id\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n    }\n  }\n': typeof types.ReviewCashCountDocument;
  '\n  mutation VerifyMpesaTransactions($input: VerifyMpesaInput!) {\n    verifyMpesaTransactions(input: $input) {\n      id\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n    }\n  }\n': typeof types.VerifyMpesaTransactionsDocument;
  '\n  query GetApprovalRequests($options: ApprovalRequestListOptions) {\n    getApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n': typeof types.GetApprovalRequestsDocument;
  '\n  query GetApprovalRequest($id: ID!) {\n    getApprovalRequest(id: $id) {\n      id\n      channelId\n      type\n      status\n      dueAt\n      requestedById\n      reviewedById\n      reviewedAt\n      message\n      rejectionReasonCode\n      metadata\n      entityType\n      entityId\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.GetApprovalRequestDocument;
  '\n  query GetMyApprovalRequests($options: ApprovalRequestListOptions) {\n    getMyApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n': typeof types.GetMyApprovalRequestsDocument;
  '\n  mutation CreateApprovalRequest($input: CreateApprovalRequestInput!) {\n    createApprovalRequest(input: $input) {\n      id\n      type\n      status\n      createdAt\n    }\n  }\n': typeof types.CreateApprovalRequestDocument;
  '\n  mutation ReviewApprovalRequest($input: ReviewApprovalRequestInput!) {\n    reviewApprovalRequest(input: $input) {\n      id\n      type\n      status\n      message\n      reviewedAt\n    }\n  }\n': typeof types.ReviewApprovalRequestDocument;
  '\n  query GetAnalyticsStats($timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStats(timeRange: $timeRange, limit: $limit) {\n      topSelling {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n        quantityChangePercent\n      }\n      highestRevenue {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      highestMargin {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      trending {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        quantityChangePercent\n      }\n      salesTrend {\n        date\n        value\n      }\n      orderVolumeTrend {\n        date\n        value\n      }\n      customerGrowthTrend {\n        date\n        value\n      }\n      averageProfitMargin\n      totalRevenue\n      totalOrders\n    }\n  }\n': typeof types.GetAnalyticsStatsDocument;
  '\n  mutation RefreshAnalytics {\n    refreshAnalytics\n  }\n': typeof types.RefreshAnalyticsDocument;
  '\n      mutation UpdateProductBasic($id: ID!, $name: String!, $slug: String!, $barcode: String) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    ': typeof types.UpdateProductBasicDocument;
  '\n      mutation UpdateProductWithFacets(\n        $id: ID!\n        $name: String!\n        $slug: String!\n        $barcode: String\n        $facetValueIds: [ID!]!\n      ) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n            facetValueIds: $facetValueIds\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    ': typeof types.UpdateProductWithFacetsDocument;
};
const documents: Documents = {
  '\n  mutation UpdateOrderLineQuantity($orderLineId: ID!, $quantity: Float!) {\n    updateOrderLineQuantity(orderLineId: $orderLineId, quantity: $quantity) {\n      ... on Order {\n        id\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            customFields {\n              allowFractionalQuantity\n            }\n          }\n        }\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.UpdateOrderLineQuantityDocument,
  '\n  query GetActiveAdministrator {\n    activeAdministrator {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n':
    types.GetActiveAdministratorDocument,
  '\n  mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $username, password: $password, rememberMe: $rememberMe) {\n      ... on CurrentUser {\n        id\n        identifier\n        channels {\n          id\n          code\n          token\n        }\n      }\n      ... on InvalidCredentialsError {\n        errorCode\n        message\n      }\n      ... on NativeAuthStrategyError {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.LoginDocument,
  '\n  mutation RequestRegistrationOTP($phoneNumber: String!, $registrationData: RegistrationInput!) {\n    requestRegistrationOTP(phoneNumber: $phoneNumber, registrationData: $registrationData) {\n      success\n      message\n      sessionId\n      expiresAt\n    }\n  }\n':
    types.RequestRegistrationOtpDocument,
  '\n  mutation VerifyRegistrationOTP($phoneNumber: String!, $otp: String!, $sessionId: String!) {\n    verifyRegistrationOTP(phoneNumber: $phoneNumber, otp: $otp, sessionId: $sessionId) {\n      success\n      userId\n      message\n    }\n  }\n':
    types.VerifyRegistrationOtpDocument,
  '\n  mutation RequestLoginOTP($phoneNumber: String!) {\n    requestLoginOTP(phoneNumber: $phoneNumber) {\n      success\n      message\n      expiresAt\n    }\n  }\n':
    types.RequestLoginOtpDocument,
  '\n  mutation VerifyLoginOTP($phoneNumber: String!, $otp: String!) {\n    verifyLoginOTP(phoneNumber: $phoneNumber, otp: $otp) {\n      success\n      token\n      user {\n        id\n        identifier\n      }\n      message\n    }\n  }\n':
    types.VerifyLoginOtpDocument,
  '\n  query CheckAuthorizationStatus($identifier: String!) {\n    checkAuthorizationStatus(identifier: $identifier) {\n      status\n      message\n    }\n  }\n':
    types.CheckAuthorizationStatusDocument,
  '\n  query CheckCompanyCodeAvailability($companyCode: String!) {\n    checkCompanyCodeAvailability(companyCode: $companyCode)\n  }\n':
    types.CheckCompanyCodeAvailabilityDocument,
  '\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n': types.LogoutDocument,
  '\n  mutation UpdateAdministrator($input: UpdateActiveAdministratorInput!) {\n    updateActiveAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n':
    types.UpdateAdministratorDocument,
  '\n  mutation UpdateAdminProfile($input: UpdateAdminProfileInput!) {\n    updateAdminProfile(input: $input) {\n      id\n      firstName\n      lastName\n    }\n  }\n':
    types.UpdateAdminProfileDocument,
  '\n  query GetUserChannels {\n    me {\n      id\n      identifier\n      channels {\n        id\n        code\n        token\n      }\n    }\n  }\n':
    types.GetUserChannelsDocument,
  '\n  query GetActiveChannel {\n    activeChannel {\n      id\n      code\n      token\n      defaultCurrencyCode\n      customFields {\n        mlModelJsonAsset {\n          id\n          source\n          name\n        }\n        mlModelBinAsset {\n          id\n          source\n          name\n        }\n        mlMetadataAsset {\n          id\n          source\n          name\n        }\n        companyLogoAsset {\n          id\n          source\n          name\n          preview\n        }\n        cashierFlowEnabled\n        enablePrinter\n        subscriptionStatus\n        trialEndsAt\n        subscriptionExpiresAt\n      }\n    }\n  }\n':
    types.GetActiveChannelDocument,
  '\n  query GetStockLocations {\n    stockLocations(options: { take: 100 }) {\n      items {\n        id\n        name\n        description\n      }\n    }\n  }\n':
    types.GetStockLocationsDocument,
  '\n  query CheckSkuExists($sku: String!) {\n    productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {\n      items {\n        id\n        sku\n        product {\n          id\n          name\n        }\n      }\n    }\n  }\n':
    types.CheckSkuExistsDocument,
  '\n  query CheckBarcodeExists($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n      }\n    }\n  }\n':
    types.CheckBarcodeExistsDocument,
  '\n  mutation CreateProduct($input: CreateProductInput!) {\n    createProduct(input: $input) {\n      id\n      name\n      slug\n      description\n      enabled\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        stockOnHand\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n':
    types.CreateProductDocument,
  '\n  mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {\n    createProductVariants(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n':
    types.CreateProductVariantsDocument,
  '\n  mutation DeleteProductVariants($ids: [ID!]!) {\n    deleteProductVariants(ids: $ids) {\n      result\n      message\n    }\n  }\n':
    types.DeleteProductVariantsDocument,
  '\n  mutation CreateAssets($input: [CreateAssetInput!]!) {\n    createAssets(input: $input) {\n      ... on Asset {\n        id\n        name\n        preview\n        source\n      }\n    }\n  }\n':
    types.CreateAssetsDocument,
  '\n  mutation AssignAssetsToProduct($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n':
    types.AssignAssetsToProductDocument,
  '\n  mutation AssignAssetsToChannel($assetIds: [ID!]!, $channelId: ID!) {\n    assignAssetsToChannel(input: { assetIds: $assetIds, channelId: $channelId }) {\n      id\n      name\n    }\n  }\n':
    types.AssignAssetsToChannelDocument,
  '\n  mutation DeleteAsset($input: DeleteAssetInput!) {\n    deleteAsset(input: $input) {\n      result\n      message\n    }\n  }\n':
    types.DeleteAssetDocument,
  '\n  mutation UpdateProductAssets($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n':
    types.UpdateProductAssetsDocument,
  '\n  query GetProductDetail($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      slug\n      description\n      enabled\n      customFields {\n        barcode\n      }\n      facetValues {\n        id\n        name\n        code\n        facet {\n          id\n          code\n        }\n      }\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        stockOnHand\n        trackInventory\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          id\n          stockOnHand\n          stockLocation {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n':
    types.GetProductDetailDocument,
  '\n  query GetProducts($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        description\n        enabled\n        featuredAsset {\n          id\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n':
    types.GetProductsDocument,
  '\n  mutation DeleteProduct($id: ID!) {\n    deleteProduct(id: $id) {\n      result\n      message\n    }\n  }\n':
    types.DeleteProductDocument,
  '\n  mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!) {\n    createProductOptionGroup(input: $input) {\n      id\n      code\n      name\n      options {\n        id\n        code\n        name\n      }\n    }\n  }\n':
    types.CreateProductOptionGroupDocument,
  '\n  mutation CreateProductOption($input: CreateProductOptionInput!) {\n    createProductOption(input: $input) {\n      id\n      code\n      name\n      group {\n        id\n        name\n      }\n    }\n  }\n':
    types.CreateProductOptionDocument,
  '\n  mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {\n    addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {\n      id\n      name\n      optionGroups {\n        id\n        code\n        name\n        options {\n          id\n          code\n          name\n        }\n      }\n    }\n  }\n':
    types.AddOptionGroupToProductDocument,
  '\n  mutation UpdateProductVariant($input: UpdateProductVariantInput!) {\n    updateProductVariant(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n':
    types.UpdateProductVariantDocument,
  '\n  query SearchProducts($term: String!) {\n    products(options: { filter: { name: { contains: $term } }, take: 5 }) {\n      items {\n        id\n        name\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n':
    types.SearchProductsDocument,
  '\n  query GetProduct($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      featuredAsset {\n        preview\n      }\n      facetValues {\n        id\n        name\n        facet {\n          code\n        }\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        trackInventory\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          stockLocationId\n          stockOnHand\n        }\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n':
    types.GetProductDocument,
  '\n  query GetVariantStockLevel($variantId: ID!) {\n    productVariant(id: $variantId) {\n      id\n      name\n      sku\n      stockOnHand\n      stockLevels {\n        id\n        stockOnHand\n        stockLocation {\n          id\n          name\n        }\n      }\n    }\n  }\n':
    types.GetVariantStockLevelDocument,
  '\n  query SearchByBarcode($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n        }\n      }\n    }\n  }\n':
    types.SearchByBarcodeDocument,
  '\n  query PrefetchProducts($take: Int!, $skip: Int) {\n    products(options: { take: $take, skip: $skip }) {\n      totalItems\n      items {\n        id\n        name\n        enabled\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n':
    types.PrefetchProductsDocument,
  '\n  query GetFacetsByCodes($codes: [String!]!) {\n    facets(options: { filter: { code: { in: $codes } }, take: 10 }) {\n      items {\n        id\n        code\n        name\n      }\n    }\n  }\n':
    types.GetFacetsByCodesDocument,
  '\n  query GetFacetValues($facetId: String!, $term: String) {\n    facetValues(\n      options: { filter: { facetId: { eq: $facetId }, name: { contains: $term } }, take: 20 }\n    ) {\n      items {\n        id\n        name\n        code\n      }\n    }\n  }\n':
    types.GetFacetValuesDocument,
  '\n  mutation CreateFacet($input: CreateFacetInput!) {\n    createFacet(input: $input) {\n      id\n      code\n      name\n    }\n  }\n':
    types.CreateFacetDocument,
  '\n  mutation CreateFacetValue($input: CreateFacetValueInput!) {\n    createFacetValue(input: $input) {\n      id\n      name\n      code\n    }\n  }\n':
    types.CreateFacetValueDocument,
  '\n  query GetOrdersForPeriod($startDate: DateTime!) {\n    orders(options: { filter: { orderPlacedAt: { after: $startDate } }, take: 100 }) {\n      items {\n        id\n        total\n        totalWithTax\n        orderPlacedAt\n        state\n        payments {\n          id\n          amount\n          method\n          state\n        }\n      }\n    }\n  }\n':
    types.GetOrdersForPeriodDocument,
  '\n  query GetDashboardStats($startDate: DateTime, $endDate: DateTime) {\n    dashboardStats(startDate: $startDate, endDate: $endDate) {\n      sales {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      purchases {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      expenses {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      salesSummary {\n        today {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        week {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        month {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n      }\n    }\n  }\n':
    types.GetDashboardStatsDocument,
  '\n  query GetStockValueStats($stockLocationId: ID, $forceRefresh: Boolean) {\n    stockValueStats(stockLocationId: $stockLocationId, forceRefresh: $forceRefresh) {\n      retail\n      wholesale\n      cost\n    }\n  }\n':
    types.GetStockValueStatsDocument,
  '\n  query GetProductStats {\n    products(options: { take: 1 }) {\n      totalItems\n    }\n    productVariants(options: { take: 1 }) {\n      totalItems\n    }\n  }\n':
    types.GetProductStatsDocument,
  '\n  query GetRecentOrders {\n    orders(options: { take: 10, sort: { createdAt: DESC } }) {\n      items {\n        id\n        code\n        total\n        totalWithTax\n        state\n        createdAt\n        orderPlacedAt\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            sku\n            product {\n              id\n              name\n            }\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n      }\n    }\n  }\n':
    types.GetRecentOrdersDocument,
  '\n  mutation CreateDraftOrder {\n    createDraftOrder {\n      id\n      code\n      state\n      total\n      totalWithTax\n    }\n  }\n':
    types.CreateDraftOrderDocument,
  '\n  mutation CreateOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        metadata\n      }\n    }\n  }\n':
    types.CreateOrderDocument,
  '\n  mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {\n    addItemToDraftOrder(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n':
    types.AddItemToDraftOrderDocument,
  '\n  mutation RemoveDraftOrderLine($orderId: ID!, $orderLineId: ID!) {\n    removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n':
    types.RemoveDraftOrderLineDocument,
  '\n  mutation AdjustDraftOrderLine($orderId: ID!, $input: AdjustDraftOrderLineInput!) {\n    adjustDraftOrderLine(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n':
    types.AdjustDraftOrderLineDocument,
  '\n  mutation AddManualPaymentToOrder($input: ManualPaymentInput!) {\n    addManualPaymentToOrder(input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        payments {\n          id\n          state\n          amount\n          method\n          metadata\n        }\n      }\n      ... on ManualPaymentStateError {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.AddManualPaymentToOrderDocument,
  '\n  mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {\n    setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetCustomerForDraftOrderDocument,
  '\n  mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {\n    setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        shippingLines {\n          id\n          shippingMethod {\n            id\n            name\n            code\n          }\n        }\n      }\n      ... on OrderModificationError {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetDraftOrderShippingMethodDocument,
  '\n  mutation SetDraftOrderBillingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderBillingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      billingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n':
    types.SetDraftOrderBillingAddressDocument,
  '\n  mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderShippingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      shippingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n':
    types.SetDraftOrderShippingAddressDocument,
  '\n  mutation TransitionOrderToState($id: ID!, $state: String!) {\n    transitionOrderToState(id: $id, state: $state) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n':
    types.TransitionOrderToStateDocument,
  '\n  mutation VoidOrder($orderId: ID!) {\n    voidOrder(orderId: $orderId) {\n      order {\n        id\n        code\n        state\n      }\n      hadPayments\n    }\n  }\n':
    types.VoidOrderDocument,
  '\n  mutation AddFulfillmentToOrder($input: FulfillOrderInput!) {\n    addFulfillmentToOrder(input: $input) {\n      ... on Fulfillment {\n        id\n        state\n        nextStates\n        createdAt\n        updatedAt\n        method\n        lines {\n          orderLineId\n          quantity\n        }\n        trackingCode\n      }\n      ... on CreateFulfillmentError {\n        errorCode\n        message\n        fulfillmentHandlerError\n      }\n      ... on FulfillmentStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n':
    types.AddFulfillmentToOrderDocument,
  '\n  query GetPaymentMethods {\n    paymentMethods(options: { take: 100 }) {\n      items {\n        id\n        code\n        name\n        description\n        enabled\n        customFields {\n          imageAsset {\n            id\n            source\n            name\n            preview\n          }\n          isActive\n        }\n      }\n    }\n  }\n':
    types.GetPaymentMethodsDocument,
  '\n  query GetOrderDetails($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      lines {\n        id\n        quantity\n        productVariant {\n          id\n          name\n          sku\n        }\n      }\n    }\n  }\n':
    types.GetOrderDetailsDocument,
  '\n  query GetOrder($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n    }\n  }\n':
    types.GetOrderDocument,
  '\n  query GetOrders($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        updatedAt\n        orderPlacedAt\n        total\n        totalWithTax\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n            sku\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n        customFields {\n          reversedAt\n        }\n      }\n      totalItems\n    }\n  }\n':
    types.GetOrdersDocument,
  '\n  query GetPayments($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        orderPlacedAt\n        payments {\n          id\n          state\n          amount\n          method\n          transactionId\n          createdAt\n          updatedAt\n          errorMessage\n          metadata\n        }\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      totalItems\n    }\n  }\n':
    types.GetPaymentsDocument,
  '\n  query GetPaymentFull($orderId: ID!) {\n    order(id: $orderId) {\n      id\n      code\n      state\n      createdAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        transactionId\n        createdAt\n        updatedAt\n        errorMessage\n        metadata\n        nextStates\n        refunds {\n          id\n          total\n          state\n          reason\n          createdAt\n        }\n      }\n    }\n  }\n':
    types.GetPaymentFullDocument,
  '\n  query GetOrderFull($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      createdAt\n      updatedAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        createdAt\n        metadata\n      }\n      customFields {\n        reversedAt\n      }\n      fulfillments {\n        id\n        state\n        method\n        trackingCode\n        createdAt\n        updatedAt\n      }\n      billingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n      shippingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n    }\n  }\n':
    types.GetOrderFullDocument,
  '\n  query GetMlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n    }\n  }\n':
    types.GetMlTrainingInfoDocument,
  '\n  query GetMlTrainingManifest($channelId: ID!) {\n    mlTrainingManifest(channelId: $channelId) {\n      channelId\n      version\n      extractedAt\n      products {\n        productId\n        productName\n        images {\n          assetId\n          url\n          filename\n        }\n      }\n    }\n  }\n':
    types.GetMlTrainingManifestDocument,
  '\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n':
    types.ExtractPhotosForTrainingDocument,
  '\n  mutation UpdateTrainingStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {\n    updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)\n  }\n':
    types.UpdateTrainingStatusDocument,
  '\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n':
    types.StartTrainingDocument,
  '\n  mutation CompleteTraining(\n    $channelId: ID!\n    $modelJson: Upload!\n    $weightsFile: Upload!\n    $metadata: Upload!\n  ) {\n    completeTraining(\n      channelId: $channelId\n      modelJson: $modelJson\n      weightsFile: $weightsFile\n      metadata: $metadata\n    )\n  }\n':
    types.CompleteTrainingDocument,
  '\n  query GetCustomers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        outstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          lastRepaymentDate\n          lastRepaymentAmount\n          creditDuration\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n        user {\n          id\n          identifier\n          verified\n        }\n      }\n    }\n  }\n':
    types.GetCustomersDocument,
  '\n  query GetCountries($options: CountryListOptions) {\n    countries(options: $options) {\n      totalItems\n      items {\n        id\n        code\n        name\n        enabled\n      }\n    }\n  }\n':
    types.GetCountriesDocument,
  '\n  query GetCustomer($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      outstandingAmount\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n      user {\n        id\n        identifier\n        verified\n      }\n    }\n  }\n':
    types.GetCustomerDocument,
  '\n  mutation CreateCustomer($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n      }\n    }\n  }\n':
    types.CreateCustomerDocument,
  '\n  mutation UpdateCustomer($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.UpdateCustomerDocument,
  '\n  mutation DeleteCustomer($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n':
    types.DeleteCustomerDocument,
  '\n  mutation CreateCustomerAddress($customerId: ID!, $input: CreateAddressInput!) {\n    createCustomerAddress(customerId: $customerId, input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n':
    types.CreateCustomerAddressDocument,
  '\n  mutation UpdateCustomerAddress($input: UpdateAddressInput!) {\n    updateCustomerAddress(input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n':
    types.UpdateCustomerAddressDocument,
  '\n  mutation DeleteCustomerAddress($id: ID!) {\n    deleteCustomerAddress(id: $id) {\n      success\n    }\n  }\n':
    types.DeleteCustomerAddressDocument,
  '\n  query GetCreditSummary($customerId: ID!) {\n    creditSummary(customerId: $customerId) {\n      customerId\n      isCreditApproved\n      creditFrozen\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n':
    types.GetCreditSummaryDocument,
  '\n  query ValidateCredit($input: ValidateCreditInput!) {\n    validateCredit(input: $input) {\n      isValid\n      error\n      availableCredit\n      estimatedOrderTotal\n      wouldExceedLimit\n    }\n  }\n':
    types.ValidateCreditDocument,
  '\n  mutation ApproveCustomerCredit($input: ApproveCustomerCreditInput!) {\n    approveCustomerCredit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n':
    types.ApproveCustomerCreditDocument,
  '\n  mutation UpdateCustomerCreditLimit($input: UpdateCustomerCreditLimitInput!) {\n    updateCustomerCreditLimit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n':
    types.UpdateCustomerCreditLimitDocument,
  '\n  mutation UpdateCreditDuration($input: UpdateCreditDurationInput!) {\n    updateCreditDuration(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n':
    types.UpdateCreditDurationDocument,
  '\n  query GetUnpaidOrdersForCustomer($customerId: ID!) {\n    unpaidOrdersForCustomer(customerId: $customerId) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      createdAt\n      payments {\n        id\n        state\n        amount\n        method\n      }\n    }\n  }\n':
    types.GetUnpaidOrdersForCustomerDocument,
  '\n  mutation AllocateBulkPayment($input: PaymentAllocationInput!) {\n    allocateBulkPayment(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n':
    types.AllocateBulkPaymentDocument,
  '\n  mutation PaySingleOrder($input: PaySingleOrderInput!) {\n    paySingleOrder(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n':
    types.PaySingleOrderDocument,
  '\n  mutation PaySinglePurchase($input: PaySinglePurchaseInput!) {\n    paySinglePurchase(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n':
    types.PaySinglePurchaseDocument,
  '\n  query GetSupplierCreditSummary($supplierId: ID!) {\n    supplierCreditSummary(supplierId: $supplierId) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n':
    types.GetSupplierCreditSummaryDocument,
  '\n  mutation ApproveSupplierCredit($input: ApproveSupplierCreditInput!) {\n    approveSupplierCredit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n':
    types.ApproveSupplierCreditDocument,
  '\n  mutation UpdateSupplierCreditLimit($input: UpdateSupplierCreditLimitInput!) {\n    updateSupplierCreditLimit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n':
    types.UpdateSupplierCreditLimitDocument,
  '\n  mutation UpdateSupplierCreditDuration($input: UpdateSupplierCreditDurationInput!) {\n    updateSupplierCreditDuration(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n':
    types.UpdateSupplierCreditDurationDocument,
  '\n  mutation AllocateBulkSupplierPayment($input: SupplierPaymentAllocationInput!) {\n    allocateBulkSupplierPayment(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n':
    types.AllocateBulkSupplierPaymentDocument,
  '\n  mutation SetOrderLineCustomPrice($input: SetOrderLineCustomPriceInput!) {\n    setOrderLineCustomPrice(input: $input) {\n      ... on OrderLine {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        customFields {\n          customLinePrice\n          priceOverrideReason\n        }\n        productVariant {\n          id\n          name\n          price\n        }\n      }\n      ... on Error {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.SetOrderLineCustomPriceDocument,
  '\n  query GetSuppliers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        supplierOutstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n          isSupplierCreditApproved\n          supplierCreditLimit\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n      }\n    }\n  }\n':
    types.GetSuppliersDocument,
  '\n  query GetSupplier($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n    }\n  }\n':
    types.GetSupplierDocument,
  '\n  mutation CreateSupplier($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        creditDuration\n      }\n    }\n  }\n':
    types.CreateSupplierDocument,
  '\n  mutation UpdateSupplier($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n':
    types.UpdateSupplierDocument,
  '\n  mutation DeleteSupplier($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n':
    types.DeleteSupplierDocument,
  '\n  mutation UpdateChannelLogo($logoAssetId: ID) {\n    updateChannelLogo(logoAssetId: $logoAssetId) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n':
    types.UpdateChannelLogoDocument,
  '\n  mutation UpdateCashierSettings($cashierFlowEnabled: Boolean) {\n    updateCashierSettings(cashierFlowEnabled: $cashierFlowEnabled) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n':
    types.UpdateCashierSettingsDocument,
  '\n  mutation UpdatePrinterSettings($enablePrinter: Boolean!) {\n    updatePrinterSettings(enablePrinter: $enablePrinter) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n':
    types.UpdatePrinterSettingsDocument,
  '\n  mutation InviteChannelAdministrator($input: InviteAdministratorInput!) {\n    inviteChannelAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n':
    types.InviteChannelAdministratorDocument,
  '\n  query GetRoleTemplates {\n    roleTemplates {\n      code\n      name\n      description\n      permissions\n    }\n  }\n':
    types.GetRoleTemplatesDocument,
  '\n  mutation CreateChannelAdmin($input: CreateChannelAdminInput!) {\n    createChannelAdmin(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n':
    types.CreateChannelAdminDocument,
  '\n  mutation UpdateChannelAdmin($id: ID!, $permissions: [String!]!) {\n    updateChannelAdmin(id: $id, permissions: $permissions) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n':
    types.UpdateChannelAdminDocument,
  '\n  mutation DisableChannelAdmin($id: ID!) {\n    disableChannelAdmin(id: $id) {\n      success\n      message\n    }\n  }\n':
    types.DisableChannelAdminDocument,
  '\n  query GetAdministrators($options: AdministratorListOptions) {\n    administrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        user {\n          id\n          identifier\n          verified\n          roles {\n            id\n            code\n            permissions\n            channels {\n              id\n            }\n          }\n        }\n      }\n    }\n  }\n':
    types.GetAdministratorsDocument,
  '\n  query GetAdministratorById($id: ID!) {\n    administrator(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n':
    types.GetAdministratorByIdDocument,
  '\n  query GetAdministratorByUserId($userId: ID!) {\n    administratorByUserId(userId: $userId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n':
    types.GetAdministratorByUserIdDocument,
  '\n  mutation CreateChannelPaymentMethod($input: CreatePaymentMethodInput!) {\n    createChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n    }\n  }\n':
    types.CreateChannelPaymentMethodDocument,
  '\n  mutation UpdateChannelPaymentMethod($input: UpdatePaymentMethodInput!) {\n    updateChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n      customFields {\n        imageAsset {\n          id\n          preview\n        }\n        isActive\n      }\n    }\n  }\n':
    types.UpdateChannelPaymentMethodDocument,
  '\n  query GetAuditLogs($options: AuditLogOptions) {\n    auditLogs(options: $options) {\n      id\n      timestamp\n      channelId\n      eventType\n      entityType\n      entityId\n      userId\n      data\n      source\n    }\n  }\n':
    types.GetAuditLogsDocument,
  '\n  query GetUserNotifications($options: NotificationListOptions) {\n    getUserNotifications(options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        data\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n':
    types.GetUserNotificationsDocument,
  '\n  query GetUnreadCount {\n    getUnreadCount\n  }\n': types.GetUnreadCountDocument,
  '\n  mutation MarkNotificationAsRead($id: ID!) {\n    markNotificationAsRead(id: $id)\n  }\n':
    types.MarkNotificationAsReadDocument,
  '\n  mutation MarkAllAsRead {\n    markAllAsRead\n  }\n': types.MarkAllAsReadDocument,
  '\n  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {\n    subscribeToPush(subscription: $subscription)\n  }\n':
    types.SubscribeToPushDocument,
  '\n  mutation UnsubscribeToPush {\n    unsubscribeToPush\n  }\n': types.UnsubscribeToPushDocument,
  '\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.GetSubscriptionTiersDocument,
  '\n  query GetChannelSubscription($channelId: ID) {\n    getChannelSubscription(channelId: $channelId) {\n      tier {\n        id\n        code\n        name\n        description\n        priceMonthly\n        priceYearly\n        features\n      }\n      status\n      trialEndsAt\n      subscriptionStartedAt\n      subscriptionExpiresAt\n      billingCycle\n      lastPaymentDate\n      lastPaymentAmount\n    }\n  }\n':
    types.GetChannelSubscriptionDocument,
  '\n  query CheckSubscriptionStatus($channelId: ID) {\n    checkSubscriptionStatus(channelId: $channelId) {\n      isValid\n      status\n      daysRemaining\n      expiresAt\n      trialEndsAt\n      canPerformAction\n    }\n  }\n':
    types.CheckSubscriptionStatusDocument,
  '\n  mutation InitiateSubscriptionPurchase(\n    $channelId: ID!\n    $tierId: String!\n    $billingCycle: String!\n    $phoneNumber: String!\n    $email: String!\n    $paymentMethod: String\n  ) {\n    initiateSubscriptionPurchase(\n      channelId: $channelId\n      tierId: $tierId\n      billingCycle: $billingCycle\n      phoneNumber: $phoneNumber\n      email: $email\n      paymentMethod: $paymentMethod\n    ) {\n      success\n      reference\n      authorizationUrl\n      message\n    }\n  }\n':
    types.InitiateSubscriptionPurchaseDocument,
  '\n  mutation VerifySubscriptionPayment($channelId: ID!, $reference: String!) {\n    verifySubscriptionPayment(channelId: $channelId, reference: $reference)\n  }\n':
    types.VerifySubscriptionPaymentDocument,
  '\n  mutation CancelSubscription($channelId: ID!) {\n    cancelSubscription(channelId: $channelId)\n  }\n':
    types.CancelSubscriptionDocument,
  '\n  mutation RecordPurchase($input: RecordPurchaseInput!) {\n    recordPurchase(input: $input) {\n      id\n      supplierId\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.RecordPurchaseDocument,
  '\n  query GetPurchases($options: PurchaseListOptions) {\n    purchases(options: $options) {\n      items {\n        id\n        supplierId\n        status\n        supplier {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        purchaseDate\n        referenceNumber\n        totalCost\n        paymentStatus\n        isCreditPurchase\n        notes\n        lines {\n          id\n          variantId\n          variant {\n            id\n            name\n            product {\n              id\n              name\n            }\n          }\n          quantity\n          unitCost\n          totalCost\n          stockLocationId\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n':
    types.GetPurchasesDocument,
  '\n  query GetPurchase($id: ID!) {\n    purchase(id: $id) {\n      id\n      supplierId\n      status\n      supplier {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      isCreditPurchase\n      notes\n      lines {\n        id\n        variantId\n        variant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n        stockLocation {\n          id\n          name\n        }\n      }\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.GetPurchaseDocument,
  '\n  mutation ConfirmPurchase($id: ID!) {\n    confirmPurchase(id: $id) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      paymentStatus\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n':
    types.ConfirmPurchaseDocument,
  '\n  mutation UpdateDraftPurchase($id: ID!, $input: UpdateDraftPurchaseInput!) {\n    updateDraftPurchase(id: $id, input: $input) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n':
    types.UpdateDraftPurchaseDocument,
  '\n  mutation RecordStockAdjustment($input: RecordStockAdjustmentInput!) {\n    recordStockAdjustment(input: $input) {\n      id\n      reason\n      notes\n      adjustedByUserId\n      lines {\n        id\n        variantId\n        quantityChange\n        previousStock\n        newStock\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.RecordStockAdjustmentDocument,
  '\n  query GetStockAdjustments($options: StockAdjustmentListOptions) {\n    stockAdjustments(options: $options) {\n      items {\n        id\n        reason\n        notes\n        adjustedByUserId\n        lines {\n          id\n          variantId\n          quantityChange\n          previousStock\n          newStock\n          stockLocationId\n          variant {\n            id\n            name\n            sku\n            product {\n              name\n            }\n          }\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n':
    types.GetStockAdjustmentsDocument,
  '\n  query GetLedgerAccounts {\n    ledgerAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n':
    types.GetLedgerAccountsDocument,
  '\n  query GetEligibleDebitAccounts {\n    eligibleDebitAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n':
    types.GetEligibleDebitAccountsDocument,
  '\n  mutation RecordExpense($input: RecordExpenseInput!) {\n    recordExpense(input: $input) {\n      sourceId\n    }\n  }\n':
    types.RecordExpenseDocument,
  '\n  mutation CreateInterAccountTransfer($input: InterAccountTransferInput!) {\n    createInterAccountTransfer(input: $input) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n':
    types.CreateInterAccountTransferDocument,
  '\n  query GetJournalEntries($options: JournalEntriesOptions) {\n    journalEntries(options: $options) {\n      items {\n        id\n        entryDate\n        postedAt\n        sourceType\n        sourceId\n        memo\n        lines {\n          id\n          accountCode\n          accountName\n          debit\n          credit\n          meta\n        }\n      }\n      totalItems\n    }\n  }\n':
    types.GetJournalEntriesDocument,
  '\n  query GetJournalEntry($id: ID!) {\n    journalEntry(id: $id) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n':
    types.GetJournalEntryDocument,
  '\n  query GetChannelReconciliationConfig($channelId: Int!) {\n    channelReconciliationConfig(channelId: $channelId) {\n      paymentMethodId\n      paymentMethodCode\n      reconciliationType\n      ledgerAccountCode\n      isCashierControlled\n      requiresReconciliation\n    }\n  }\n':
    types.GetChannelReconciliationConfigDocument,
  '\n  query GetShiftModalPrefillData($channelId: Int!) {\n    shiftModalPrefillData(channelId: $channelId) {\n      config {\n        paymentMethodId\n        paymentMethodCode\n        reconciliationType\n        ledgerAccountCode\n        isCashierControlled\n        requiresReconciliation\n      }\n      balances {\n        accountCode\n        accountName\n        balanceCents\n      }\n    }\n  }\n':
    types.GetShiftModalPrefillDataDocument,
  '\n  query GetCurrentCashierSession($channelId: Int!) {\n    currentCashierSession(channelId: $channelId) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      closedAt\n      closingDeclared\n      status\n    }\n  }\n':
    types.GetCurrentCashierSessionDocument,
  '\n  query GetCashierSession($sessionId: String!) {\n    cashierSession(sessionId: $sessionId) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n':
    types.GetCashierSessionDocument,
  '\n  query GetCashierSessions($channelId: Int!, $options: CashierSessionListOptions) {\n    cashierSessions(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        cashierUserId\n        openedAt\n        closedAt\n        closingDeclared\n        status\n      }\n      totalItems\n    }\n  }\n':
    types.GetCashierSessionsDocument,
  '\n  mutation OpenCashierSession($input: OpenCashierSessionInput!) {\n    openCashierSession(input: $input) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      status\n    }\n  }\n':
    types.OpenCashierSessionDocument,
  '\n  mutation CloseCashierSession($input: CloseCashierSessionInput!) {\n    closeCashierSession(input: $input) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n':
    types.CloseCashierSessionDocument,
  '\n  mutation CreateCashierSessionReconciliation($sessionId: String!, $notes: String) {\n    createCashierSessionReconciliation(sessionId: $sessionId, notes: $notes) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n':
    types.CreateCashierSessionReconciliationDocument,
  '\n  mutation CreateReconciliation($input: CreateReconciliationInput!) {\n    createReconciliation(input: $input) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n':
    types.CreateReconciliationDocument,
  '\n  query GetReconciliations($channelId: Int!, $options: ReconciliationListOptions) {\n    reconciliations(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        scope\n        scopeRefId\n        snapshotAt\n        status\n        expectedBalance\n        actualBalance\n        varianceAmount\n        notes\n        createdBy\n      }\n      totalItems\n    }\n  }\n':
    types.GetReconciliationsDocument,
  '\n  query GetReconciliationDetails($reconciliationId: String!) {\n    reconciliationDetails(reconciliationId: $reconciliationId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n':
    types.GetReconciliationDetailsDocument,
  '\n  query GetSessionReconciliationDetails($sessionId: String!, $kind: String, $channelId: Int) {\n    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind, channelId: $channelId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n':
    types.GetSessionReconciliationDetailsDocument,
  '\n  query GetAccountBalancesAsOf($channelId: Int!, $asOfDate: String!) {\n    accountBalancesAsOf(channelId: $channelId, asOfDate: $asOfDate) {\n      accountId\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n':
    types.GetAccountBalancesAsOfDocument,
  '\n  query GetLastClosedSessionClosingBalances($channelId: Int!) {\n    lastClosedSessionClosingBalances(channelId: $channelId) {\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n':
    types.GetLastClosedSessionClosingBalancesDocument,
  '\n  query GetExpectedSessionClosingBalances($sessionId: String!) {\n    expectedSessionClosingBalances(sessionId: $sessionId) {\n      accountCode\n      accountName\n      expectedBalanceCents\n    }\n  }\n':
    types.GetExpectedSessionClosingBalancesDocument,
  '\n  query GetSessionCashCounts($sessionId: String!) {\n    sessionCashCounts(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n      countedByUserId\n    }\n  }\n':
    types.GetSessionCashCountsDocument,
  '\n  query GetPendingVarianceReviews($channelId: Int!) {\n    pendingVarianceReviews(channelId: $channelId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      countedByUserId\n    }\n  }\n':
    types.GetPendingVarianceReviewsDocument,
  '\n  query GetSessionMpesaVerifications($sessionId: String!) {\n    sessionMpesaVerifications(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n      verifiedByUserId\n    }\n  }\n':
    types.GetSessionMpesaVerificationsDocument,
  '\n  mutation RecordCashCount($input: RecordCashCountInput!) {\n    recordCashCount(input: $input) {\n      count {\n        id\n        sessionId\n        countType\n        takenAt\n        declaredCash\n        varianceReason\n        countedByUserId\n      }\n      hasVariance\n      varianceHidden\n    }\n  }\n':
    types.RecordCashCountDocument,
  '\n  mutation ExplainVariance($countId: String!, $reason: String!) {\n    explainVariance(countId: $countId, reason: $reason) {\n      id\n      varianceReason\n    }\n  }\n':
    types.ExplainVarianceDocument,
  '\n  mutation ReviewCashCount($countId: String!, $notes: String) {\n    reviewCashCount(countId: $countId, notes: $notes) {\n      id\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n    }\n  }\n':
    types.ReviewCashCountDocument,
  '\n  mutation VerifyMpesaTransactions($input: VerifyMpesaInput!) {\n    verifyMpesaTransactions(input: $input) {\n      id\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n    }\n  }\n':
    types.VerifyMpesaTransactionsDocument,
  '\n  query GetApprovalRequests($options: ApprovalRequestListOptions) {\n    getApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n':
    types.GetApprovalRequestsDocument,
  '\n  query GetApprovalRequest($id: ID!) {\n    getApprovalRequest(id: $id) {\n      id\n      channelId\n      type\n      status\n      dueAt\n      requestedById\n      reviewedById\n      reviewedAt\n      message\n      rejectionReasonCode\n      metadata\n      entityType\n      entityId\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.GetApprovalRequestDocument,
  '\n  query GetMyApprovalRequests($options: ApprovalRequestListOptions) {\n    getMyApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n':
    types.GetMyApprovalRequestsDocument,
  '\n  mutation CreateApprovalRequest($input: CreateApprovalRequestInput!) {\n    createApprovalRequest(input: $input) {\n      id\n      type\n      status\n      createdAt\n    }\n  }\n':
    types.CreateApprovalRequestDocument,
  '\n  mutation ReviewApprovalRequest($input: ReviewApprovalRequestInput!) {\n    reviewApprovalRequest(input: $input) {\n      id\n      type\n      status\n      message\n      reviewedAt\n    }\n  }\n':
    types.ReviewApprovalRequestDocument,
  '\n  query GetAnalyticsStats($timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStats(timeRange: $timeRange, limit: $limit) {\n      topSelling {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n        quantityChangePercent\n      }\n      highestRevenue {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      highestMargin {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      trending {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        quantityChangePercent\n      }\n      salesTrend {\n        date\n        value\n      }\n      orderVolumeTrend {\n        date\n        value\n      }\n      customerGrowthTrend {\n        date\n        value\n      }\n      averageProfitMargin\n      totalRevenue\n      totalOrders\n    }\n  }\n':
    types.GetAnalyticsStatsDocument,
  '\n  mutation RefreshAnalytics {\n    refreshAnalytics\n  }\n': types.RefreshAnalyticsDocument,
  '\n      mutation UpdateProductBasic($id: ID!, $name: String!, $slug: String!, $barcode: String) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    ':
    types.UpdateProductBasicDocument,
  '\n      mutation UpdateProductWithFacets(\n        $id: ID!\n        $name: String!\n        $slug: String!\n        $barcode: String\n        $facetValueIds: [ID!]!\n      ) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n            facetValueIds: $facetValueIds\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    ':
    types.UpdateProductWithFacetsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateOrderLineQuantity($orderLineId: ID!, $quantity: Float!) {\n    updateOrderLineQuantity(orderLineId: $orderLineId, quantity: $quantity) {\n      ... on Order {\n        id\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            customFields {\n              allowFractionalQuantity\n            }\n          }\n        }\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateOrderLineQuantity($orderLineId: ID!, $quantity: Float!) {\n    updateOrderLineQuantity(orderLineId: $orderLineId, quantity: $quantity) {\n      ... on Order {\n        id\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            customFields {\n              allowFractionalQuantity\n            }\n          }\n        }\n      }\n      ... on ErrorResult {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetActiveAdministrator {\n    activeAdministrator {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetActiveAdministrator {\n    activeAdministrator {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $username, password: $password, rememberMe: $rememberMe) {\n      ... on CurrentUser {\n        id\n        identifier\n        channels {\n          id\n          code\n          token\n        }\n      }\n      ... on InvalidCredentialsError {\n        errorCode\n        message\n      }\n      ... on NativeAuthStrategyError {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {\n    login(username: $username, password: $password, rememberMe: $rememberMe) {\n      ... on CurrentUser {\n        id\n        identifier\n        channels {\n          id\n          code\n          token\n        }\n      }\n      ... on InvalidCredentialsError {\n        errorCode\n        message\n      }\n      ... on NativeAuthStrategyError {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestRegistrationOTP($phoneNumber: String!, $registrationData: RegistrationInput!) {\n    requestRegistrationOTP(phoneNumber: $phoneNumber, registrationData: $registrationData) {\n      success\n      message\n      sessionId\n      expiresAt\n    }\n  }\n',
): (typeof documents)['\n  mutation RequestRegistrationOTP($phoneNumber: String!, $registrationData: RegistrationInput!) {\n    requestRegistrationOTP(phoneNumber: $phoneNumber, registrationData: $registrationData) {\n      success\n      message\n      sessionId\n      expiresAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VerifyRegistrationOTP($phoneNumber: String!, $otp: String!, $sessionId: String!) {\n    verifyRegistrationOTP(phoneNumber: $phoneNumber, otp: $otp, sessionId: $sessionId) {\n      success\n      userId\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation VerifyRegistrationOTP($phoneNumber: String!, $otp: String!, $sessionId: String!) {\n    verifyRegistrationOTP(phoneNumber: $phoneNumber, otp: $otp, sessionId: $sessionId) {\n      success\n      userId\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestLoginOTP($phoneNumber: String!) {\n    requestLoginOTP(phoneNumber: $phoneNumber) {\n      success\n      message\n      expiresAt\n    }\n  }\n',
): (typeof documents)['\n  mutation RequestLoginOTP($phoneNumber: String!) {\n    requestLoginOTP(phoneNumber: $phoneNumber) {\n      success\n      message\n      expiresAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VerifyLoginOTP($phoneNumber: String!, $otp: String!) {\n    verifyLoginOTP(phoneNumber: $phoneNumber, otp: $otp) {\n      success\n      token\n      user {\n        id\n        identifier\n      }\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation VerifyLoginOTP($phoneNumber: String!, $otp: String!) {\n    verifyLoginOTP(phoneNumber: $phoneNumber, otp: $otp) {\n      success\n      token\n      user {\n        id\n        identifier\n      }\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CheckAuthorizationStatus($identifier: String!) {\n    checkAuthorizationStatus(identifier: $identifier) {\n      status\n      message\n    }\n  }\n',
): (typeof documents)['\n  query CheckAuthorizationStatus($identifier: String!) {\n    checkAuthorizationStatus(identifier: $identifier) {\n      status\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CheckCompanyCodeAvailability($companyCode: String!) {\n    checkCompanyCodeAvailability(companyCode: $companyCode)\n  }\n',
): (typeof documents)['\n  query CheckCompanyCodeAvailability($companyCode: String!) {\n    checkCompanyCodeAvailability(companyCode: $companyCode)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n',
): (typeof documents)['\n  mutation Logout {\n    logout {\n      success\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateAdministrator($input: UpdateActiveAdministratorInput!) {\n    updateActiveAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateAdministrator($input: UpdateActiveAdministratorInput!) {\n    updateActiveAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      customFields {\n        profilePicture {\n          id\n          preview\n          source\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateAdminProfile($input: UpdateAdminProfileInput!) {\n    updateAdminProfile(input: $input) {\n      id\n      firstName\n      lastName\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateAdminProfile($input: UpdateAdminProfileInput!) {\n    updateAdminProfile(input: $input) {\n      id\n      firstName\n      lastName\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetUserChannels {\n    me {\n      id\n      identifier\n      channels {\n        id\n        code\n        token\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetUserChannels {\n    me {\n      id\n      identifier\n      channels {\n        id\n        code\n        token\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetActiveChannel {\n    activeChannel {\n      id\n      code\n      token\n      defaultCurrencyCode\n      customFields {\n        mlModelJsonAsset {\n          id\n          source\n          name\n        }\n        mlModelBinAsset {\n          id\n          source\n          name\n        }\n        mlMetadataAsset {\n          id\n          source\n          name\n        }\n        companyLogoAsset {\n          id\n          source\n          name\n          preview\n        }\n        cashierFlowEnabled\n        enablePrinter\n        subscriptionStatus\n        trialEndsAt\n        subscriptionExpiresAt\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetActiveChannel {\n    activeChannel {\n      id\n      code\n      token\n      defaultCurrencyCode\n      customFields {\n        mlModelJsonAsset {\n          id\n          source\n          name\n        }\n        mlModelBinAsset {\n          id\n          source\n          name\n        }\n        mlMetadataAsset {\n          id\n          source\n          name\n        }\n        companyLogoAsset {\n          id\n          source\n          name\n          preview\n        }\n        cashierFlowEnabled\n        enablePrinter\n        subscriptionStatus\n        trialEndsAt\n        subscriptionExpiresAt\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetStockLocations {\n    stockLocations(options: { take: 100 }) {\n      items {\n        id\n        name\n        description\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetStockLocations {\n    stockLocations(options: { take: 100 }) {\n      items {\n        id\n        name\n        description\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CheckSkuExists($sku: String!) {\n    productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {\n      items {\n        id\n        sku\n        product {\n          id\n          name\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query CheckSkuExists($sku: String!) {\n    productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {\n      items {\n        id\n        sku\n        product {\n          id\n          name\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CheckBarcodeExists($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query CheckBarcodeExists($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateProduct($input: CreateProductInput!) {\n    createProduct(input: $input) {\n      id\n      name\n      slug\n      description\n      enabled\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        stockOnHand\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateProduct($input: CreateProductInput!) {\n    createProduct(input: $input) {\n      id\n      name\n      slug\n      description\n      enabled\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        stockOnHand\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {\n    createProductVariants(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {\n    createProductVariants(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteProductVariants($ids: [ID!]!) {\n    deleteProductVariants(ids: $ids) {\n      result\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation DeleteProductVariants($ids: [ID!]!) {\n    deleteProductVariants(ids: $ids) {\n      result\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateAssets($input: [CreateAssetInput!]!) {\n    createAssets(input: $input) {\n      ... on Asset {\n        id\n        name\n        preview\n        source\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateAssets($input: [CreateAssetInput!]!) {\n    createAssets(input: $input) {\n      ... on Asset {\n        id\n        name\n        preview\n        source\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AssignAssetsToProduct($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AssignAssetsToProduct($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AssignAssetsToChannel($assetIds: [ID!]!, $channelId: ID!) {\n    assignAssetsToChannel(input: { assetIds: $assetIds, channelId: $channelId }) {\n      id\n      name\n    }\n  }\n',
): (typeof documents)['\n  mutation AssignAssetsToChannel($assetIds: [ID!]!, $channelId: ID!) {\n    assignAssetsToChannel(input: { assetIds: $assetIds, channelId: $channelId }) {\n      id\n      name\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteAsset($input: DeleteAssetInput!) {\n    deleteAsset(input: $input) {\n      result\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation DeleteAsset($input: DeleteAssetInput!) {\n    deleteAsset(input: $input) {\n      result\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateProductAssets($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateProductAssets($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {\n    updateProduct(\n      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }\n    ) {\n      id\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetProductDetail($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      slug\n      description\n      enabled\n      customFields {\n        barcode\n      }\n      facetValues {\n        id\n        name\n        code\n        facet {\n          id\n          code\n        }\n      }\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        stockOnHand\n        trackInventory\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          id\n          stockOnHand\n          stockLocation {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetProductDetail($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      slug\n      description\n      enabled\n      customFields {\n        barcode\n      }\n      facetValues {\n        id\n        name\n        code\n        facet {\n          id\n          code\n        }\n      }\n      assets {\n        id\n        name\n        preview\n        source\n      }\n      featuredAsset {\n        id\n        preview\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        stockOnHand\n        trackInventory\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          id\n          stockOnHand\n          stockLocation {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetProducts($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        description\n        enabled\n        featuredAsset {\n          id\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetProducts($options: ProductListOptions) {\n    products(options: $options) {\n      totalItems\n      items {\n        id\n        name\n        slug\n        description\n        enabled\n        featuredAsset {\n          id\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteProduct($id: ID!) {\n    deleteProduct(id: $id) {\n      result\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation DeleteProduct($id: ID!) {\n    deleteProduct(id: $id) {\n      result\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!) {\n    createProductOptionGroup(input: $input) {\n      id\n      code\n      name\n      options {\n        id\n        code\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!) {\n    createProductOptionGroup(input: $input) {\n      id\n      code\n      name\n      options {\n        id\n        code\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateProductOption($input: CreateProductOptionInput!) {\n    createProductOption(input: $input) {\n      id\n      code\n      name\n      group {\n        id\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateProductOption($input: CreateProductOptionInput!) {\n    createProductOption(input: $input) {\n      id\n      code\n      name\n      group {\n        id\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {\n    addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {\n      id\n      name\n      optionGroups {\n        id\n        code\n        name\n        options {\n          id\n          code\n          name\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {\n    addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {\n      id\n      name\n      optionGroups {\n        id\n        code\n        name\n        options {\n          id\n          code\n          name\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateProductVariant($input: UpdateProductVariantInput!) {\n    updateProductVariant(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateProductVariant($input: UpdateProductVariantInput!) {\n    updateProductVariant(input: $input) {\n      id\n      name\n      sku\n      price\n      priceWithTax\n      stockOnHand\n      product {\n        id\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query SearchProducts($term: String!) {\n    products(options: { filter: { name: { contains: $term } }, take: 5 }) {\n      items {\n        id\n        name\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query SearchProducts($term: String!) {\n    products(options: { filter: { name: { contains: $term } }, take: 5 }) {\n      items {\n        id\n        name\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetProduct($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      featuredAsset {\n        preview\n      }\n      facetValues {\n        id\n        name\n        facet {\n          code\n        }\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        trackInventory\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          stockLocationId\n          stockOnHand\n        }\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetProduct($id: ID!) {\n    product(id: $id) {\n      id\n      name\n      featuredAsset {\n        preview\n      }\n      facetValues {\n        id\n        name\n        facet {\n          code\n        }\n      }\n      variants {\n        id\n        name\n        sku\n        price\n        priceWithTax\n        trackInventory\n        prices {\n          price\n          currencyCode\n        }\n        stockLevels {\n          stockLocationId\n          stockOnHand\n        }\n        customFields {\n          wholesalePrice\n          allowFractionalQuantity\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetVariantStockLevel($variantId: ID!) {\n    productVariant(id: $variantId) {\n      id\n      name\n      sku\n      stockOnHand\n      stockLevels {\n        id\n        stockOnHand\n        stockLocation {\n          id\n          name\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetVariantStockLevel($variantId: ID!) {\n    productVariant(id: $variantId) {\n      id\n      name\n      sku\n      stockOnHand\n      stockLevels {\n        id\n        stockOnHand\n        stockLocation {\n          id\n          name\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query SearchByBarcode($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query SearchByBarcode($barcode: String!) {\n    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {\n      items {\n        id\n        name\n        customFields {\n          barcode\n        }\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          priceWithTax\n          stockOnHand\n          trackInventory\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query PrefetchProducts($take: Int!, $skip: Int) {\n    products(options: { take: $take, skip: $skip }) {\n      totalItems\n      items {\n        id\n        name\n        enabled\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query PrefetchProducts($take: Int!, $skip: Int) {\n    products(options: { take: $take, skip: $skip }) {\n      totalItems\n      items {\n        id\n        name\n        enabled\n        featuredAsset {\n          preview\n        }\n        facetValues {\n          id\n          name\n          facet {\n            code\n          }\n        }\n        variants {\n          id\n          name\n          sku\n          price\n          priceWithTax\n          stockOnHand\n          customFields {\n            wholesalePrice\n            allowFractionalQuantity\n          }\n          prices {\n            price\n            currencyCode\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetFacetsByCodes($codes: [String!]!) {\n    facets(options: { filter: { code: { in: $codes } }, take: 10 }) {\n      items {\n        id\n        code\n        name\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetFacetsByCodes($codes: [String!]!) {\n    facets(options: { filter: { code: { in: $codes } }, take: 10 }) {\n      items {\n        id\n        code\n        name\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetFacetValues($facetId: String!, $term: String) {\n    facetValues(\n      options: { filter: { facetId: { eq: $facetId }, name: { contains: $term } }, take: 20 }\n    ) {\n      items {\n        id\n        name\n        code\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetFacetValues($facetId: String!, $term: String) {\n    facetValues(\n      options: { filter: { facetId: { eq: $facetId }, name: { contains: $term } }, take: 20 }\n    ) {\n      items {\n        id\n        name\n        code\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateFacet($input: CreateFacetInput!) {\n    createFacet(input: $input) {\n      id\n      code\n      name\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateFacet($input: CreateFacetInput!) {\n    createFacet(input: $input) {\n      id\n      code\n      name\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateFacetValue($input: CreateFacetValueInput!) {\n    createFacetValue(input: $input) {\n      id\n      name\n      code\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateFacetValue($input: CreateFacetValueInput!) {\n    createFacetValue(input: $input) {\n      id\n      name\n      code\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetOrdersForPeriod($startDate: DateTime!) {\n    orders(options: { filter: { orderPlacedAt: { after: $startDate } }, take: 100 }) {\n      items {\n        id\n        total\n        totalWithTax\n        orderPlacedAt\n        state\n        payments {\n          id\n          amount\n          method\n          state\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetOrdersForPeriod($startDate: DateTime!) {\n    orders(options: { filter: { orderPlacedAt: { after: $startDate } }, take: 100 }) {\n      items {\n        id\n        total\n        totalWithTax\n        orderPlacedAt\n        state\n        payments {\n          id\n          amount\n          method\n          state\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetDashboardStats($startDate: DateTime, $endDate: DateTime) {\n    dashboardStats(startDate: $startDate, endDate: $endDate) {\n      sales {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      purchases {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      expenses {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      salesSummary {\n        today {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        week {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        month {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetDashboardStats($startDate: DateTime, $endDate: DateTime) {\n    dashboardStats(startDate: $startDate, endDate: $endDate) {\n      sales {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      purchases {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      expenses {\n        today\n        week\n        month\n        accounts {\n          label\n          value\n          icon\n        }\n      }\n      salesSummary {\n        today {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        week {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n        month {\n          revenue\n          cogs\n          margin\n          orderCount\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetStockValueStats($stockLocationId: ID, $forceRefresh: Boolean) {\n    stockValueStats(stockLocationId: $stockLocationId, forceRefresh: $forceRefresh) {\n      retail\n      wholesale\n      cost\n    }\n  }\n',
): (typeof documents)['\n  query GetStockValueStats($stockLocationId: ID, $forceRefresh: Boolean) {\n    stockValueStats(stockLocationId: $stockLocationId, forceRefresh: $forceRefresh) {\n      retail\n      wholesale\n      cost\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetProductStats {\n    products(options: { take: 1 }) {\n      totalItems\n    }\n    productVariants(options: { take: 1 }) {\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetProductStats {\n    products(options: { take: 1 }) {\n      totalItems\n    }\n    productVariants(options: { take: 1 }) {\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetRecentOrders {\n    orders(options: { take: 10, sort: { createdAt: DESC } }) {\n      items {\n        id\n        code\n        total\n        totalWithTax\n        state\n        createdAt\n        orderPlacedAt\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            sku\n            product {\n              id\n              name\n            }\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetRecentOrders {\n    orders(options: { take: 10, sort: { createdAt: DESC } }) {\n      items {\n        id\n        code\n        total\n        totalWithTax\n        state\n        createdAt\n        orderPlacedAt\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          productVariant {\n            id\n            name\n            sku\n            product {\n              id\n              name\n            }\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateDraftOrder {\n    createDraftOrder {\n      id\n      code\n      state\n      total\n      totalWithTax\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateDraftOrder {\n    createDraftOrder {\n      id\n      code\n      state\n      total\n      totalWithTax\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        metadata\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateOrder($input: CreateOrderInput!) {\n    createOrder(input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        metadata\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {\n    addItemToDraftOrder(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {\n    addItemToDraftOrder(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RemoveDraftOrderLine($orderId: ID!, $orderLineId: ID!) {\n    removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation RemoveDraftOrderLine($orderId: ID!, $orderLineId: ID!) {\n    removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AdjustDraftOrderLine($orderId: ID!, $input: AdjustDraftOrderLineInput!) {\n    adjustDraftOrderLine(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AdjustDraftOrderLine($orderId: ID!, $input: AdjustDraftOrderLineInput!) {\n    adjustDraftOrderLine(orderId: $orderId, input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AddManualPaymentToOrder($input: ManualPaymentInput!) {\n    addManualPaymentToOrder(input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        payments {\n          id\n          state\n          amount\n          method\n          metadata\n        }\n      }\n      ... on ManualPaymentStateError {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AddManualPaymentToOrder($input: ManualPaymentInput!) {\n    addManualPaymentToOrder(input: $input) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        payments {\n          id\n          state\n          amount\n          method\n          metadata\n        }\n      }\n      ... on ManualPaymentStateError {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {\n    setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {\n    setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {\n    setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        shippingLines {\n          id\n          shippingMethod {\n            id\n            name\n            code\n          }\n        }\n      }\n      ... on OrderModificationError {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {\n    setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        shippingLines {\n          id\n          shippingMethod {\n            id\n            name\n            code\n          }\n        }\n      }\n      ... on OrderModificationError {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetDraftOrderBillingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderBillingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      billingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetDraftOrderBillingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderBillingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      billingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderShippingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      shippingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {\n    setDraftOrderShippingAddress(orderId: $orderId, input: $input) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      shippingAddress {\n        fullName\n        streetLine1\n        city\n        postalCode\n        country\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation TransitionOrderToState($id: ID!, $state: String!) {\n    transitionOrderToState(id: $id, state: $state) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation TransitionOrderToState($id: ID!, $state: String!) {\n    transitionOrderToState(id: $id, state: $state) {\n      ... on Order {\n        id\n        code\n        state\n        total\n        totalWithTax\n        lines {\n          id\n          quantity\n          linePrice\n          productVariant {\n            id\n            name\n          }\n        }\n      }\n      ... on OrderStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VoidOrder($orderId: ID!) {\n    voidOrder(orderId: $orderId) {\n      order {\n        id\n        code\n        state\n      }\n      hadPayments\n    }\n  }\n',
): (typeof documents)['\n  mutation VoidOrder($orderId: ID!) {\n    voidOrder(orderId: $orderId) {\n      order {\n        id\n        code\n        state\n      }\n      hadPayments\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AddFulfillmentToOrder($input: FulfillOrderInput!) {\n    addFulfillmentToOrder(input: $input) {\n      ... on Fulfillment {\n        id\n        state\n        nextStates\n        createdAt\n        updatedAt\n        method\n        lines {\n          orderLineId\n          quantity\n        }\n        trackingCode\n      }\n      ... on CreateFulfillmentError {\n        errorCode\n        message\n        fulfillmentHandlerError\n      }\n      ... on FulfillmentStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation AddFulfillmentToOrder($input: FulfillOrderInput!) {\n    addFulfillmentToOrder(input: $input) {\n      ... on Fulfillment {\n        id\n        state\n        nextStates\n        createdAt\n        updatedAt\n        method\n        lines {\n          orderLineId\n          quantity\n        }\n        trackingCode\n      }\n      ... on CreateFulfillmentError {\n        errorCode\n        message\n        fulfillmentHandlerError\n      }\n      ... on FulfillmentStateTransitionError {\n        errorCode\n        message\n        transitionError\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetPaymentMethods {\n    paymentMethods(options: { take: 100 }) {\n      items {\n        id\n        code\n        name\n        description\n        enabled\n        customFields {\n          imageAsset {\n            id\n            source\n            name\n            preview\n          }\n          isActive\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetPaymentMethods {\n    paymentMethods(options: { take: 100 }) {\n      items {\n        id\n        code\n        name\n        description\n        enabled\n        customFields {\n          imageAsset {\n            id\n            source\n            name\n            preview\n          }\n          isActive\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetOrderDetails($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      lines {\n        id\n        quantity\n        productVariant {\n          id\n          name\n          sku\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetOrderDetails($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      lines {\n        id\n        quantity\n        productVariant {\n          id\n          name\n          sku\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetOrder($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetOrder($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetOrders($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        updatedAt\n        orderPlacedAt\n        total\n        totalWithTax\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n            sku\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n        customFields {\n          reversedAt\n        }\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetOrders($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        updatedAt\n        orderPlacedAt\n        total\n        totalWithTax\n        currencyCode\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        lines {\n          id\n          quantity\n          linePrice\n          linePriceWithTax\n          productVariant {\n            id\n            name\n            sku\n          }\n        }\n        payments {\n          id\n          state\n          amount\n          method\n          createdAt\n        }\n        customFields {\n          reversedAt\n        }\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetPayments($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        orderPlacedAt\n        payments {\n          id\n          state\n          amount\n          method\n          transactionId\n          createdAt\n          updatedAt\n          errorMessage\n          metadata\n        }\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetPayments($options: OrderListOptions) {\n    orders(options: $options) {\n      items {\n        id\n        code\n        state\n        createdAt\n        orderPlacedAt\n        payments {\n          id\n          state\n          amount\n          method\n          transactionId\n          createdAt\n          updatedAt\n          errorMessage\n          metadata\n        }\n        customer {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetPaymentFull($orderId: ID!) {\n    order(id: $orderId) {\n      id\n      code\n      state\n      createdAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        transactionId\n        createdAt\n        updatedAt\n        errorMessage\n        metadata\n        nextStates\n        refunds {\n          id\n          total\n          state\n          reason\n          createdAt\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetPaymentFull($orderId: ID!) {\n    order(id: $orderId) {\n      id\n      code\n      state\n      createdAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        transactionId\n        createdAt\n        updatedAt\n        errorMessage\n        metadata\n        nextStates\n        refunds {\n          id\n          total\n          state\n          reason\n          createdAt\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetOrderFull($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      createdAt\n      updatedAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        createdAt\n        metadata\n      }\n      customFields {\n        reversedAt\n      }\n      fulfillments {\n        id\n        state\n        method\n        trackingCode\n        createdAt\n        updatedAt\n      }\n      billingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n      shippingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetOrderFull($id: ID!) {\n    order(id: $id) {\n      id\n      code\n      state\n      createdAt\n      updatedAt\n      orderPlacedAt\n      total\n      totalWithTax\n      currencyCode\n      customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n      }\n      lines {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        productVariant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n      }\n      payments {\n        id\n        state\n        amount\n        method\n        createdAt\n        metadata\n      }\n      customFields {\n        reversedAt\n      }\n      fulfillments {\n        id\n        state\n        method\n        trackingCode\n        createdAt\n        updatedAt\n      }\n      billingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n      shippingAddress {\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        province\n        country\n        phoneNumber\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetMlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n    }\n  }\n',
): (typeof documents)['\n  query GetMlTrainingInfo($channelId: ID!) {\n    mlTrainingInfo(channelId: $channelId) {\n      status\n      progress\n      startedAt\n      error\n      productCount\n      imageCount\n      hasActiveModel\n      lastTrainedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetMlTrainingManifest($channelId: ID!) {\n    mlTrainingManifest(channelId: $channelId) {\n      channelId\n      version\n      extractedAt\n      products {\n        productId\n        productName\n        images {\n          assetId\n          url\n          filename\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetMlTrainingManifest($channelId: ID!) {\n    mlTrainingManifest(channelId: $channelId) {\n      channelId\n      version\n      extractedAt\n      products {\n        productId\n        productName\n        images {\n          assetId\n          url\n          filename\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n',
): (typeof documents)['\n  mutation ExtractPhotosForTraining($channelId: ID!) {\n    extractPhotosForTraining(channelId: $channelId)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateTrainingStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {\n    updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)\n  }\n',
): (typeof documents)['\n  mutation UpdateTrainingStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {\n    updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n',
): (typeof documents)['\n  mutation StartTraining($channelId: ID!) {\n    startTraining(channelId: $channelId)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CompleteTraining(\n    $channelId: ID!\n    $modelJson: Upload!\n    $weightsFile: Upload!\n    $metadata: Upload!\n  ) {\n    completeTraining(\n      channelId: $channelId\n      modelJson: $modelJson\n      weightsFile: $weightsFile\n      metadata: $metadata\n    )\n  }\n',
): (typeof documents)['\n  mutation CompleteTraining(\n    $channelId: ID!\n    $modelJson: Upload!\n    $weightsFile: Upload!\n    $metadata: Upload!\n  ) {\n    completeTraining(\n      channelId: $channelId\n      modelJson: $modelJson\n      weightsFile: $weightsFile\n      metadata: $metadata\n    )\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCustomers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        outstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          lastRepaymentDate\n          lastRepaymentAmount\n          creditDuration\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n        user {\n          id\n          identifier\n          verified\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetCustomers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        outstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          lastRepaymentDate\n          lastRepaymentAmount\n          creditDuration\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n        user {\n          id\n          identifier\n          verified\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCountries($options: CountryListOptions) {\n    countries(options: $options) {\n      totalItems\n      items {\n        id\n        code\n        name\n        enabled\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetCountries($options: CountryListOptions) {\n    countries(options: $options) {\n      totalItems\n      items {\n        id\n        code\n        name\n        enabled\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCustomer($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      outstandingAmount\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n      user {\n        id\n        identifier\n        verified\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetCustomer($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      outstandingAmount\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n      user {\n        id\n        identifier\n        verified\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateCustomer($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateCustomer($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateCustomer($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateCustomer($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteCustomer($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation DeleteCustomer($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateCustomerAddress($customerId: ID!, $input: CreateAddressInput!) {\n    createCustomerAddress(customerId: $customerId, input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateCustomerAddress($customerId: ID!, $input: CreateAddressInput!) {\n    createCustomerAddress(customerId: $customerId, input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateCustomerAddress($input: UpdateAddressInput!) {\n    updateCustomerAddress(input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateCustomerAddress($input: UpdateAddressInput!) {\n    updateCustomerAddress(input: $input) {\n      id\n      fullName\n      streetLine1\n      streetLine2\n      city\n      postalCode\n      country {\n        code\n        name\n      }\n      phoneNumber\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteCustomerAddress($id: ID!) {\n    deleteCustomerAddress(id: $id) {\n      success\n    }\n  }\n',
): (typeof documents)['\n  mutation DeleteCustomerAddress($id: ID!) {\n    deleteCustomerAddress(id: $id) {\n      success\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCreditSummary($customerId: ID!) {\n    creditSummary(customerId: $customerId) {\n      customerId\n      isCreditApproved\n      creditFrozen\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n',
): (typeof documents)['\n  query GetCreditSummary($customerId: ID!) {\n    creditSummary(customerId: $customerId) {\n      customerId\n      isCreditApproved\n      creditFrozen\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ValidateCredit($input: ValidateCreditInput!) {\n    validateCredit(input: $input) {\n      isValid\n      error\n      availableCredit\n      estimatedOrderTotal\n      wouldExceedLimit\n    }\n  }\n',
): (typeof documents)['\n  query ValidateCredit($input: ValidateCreditInput!) {\n    validateCredit(input: $input) {\n      isValid\n      error\n      availableCredit\n      estimatedOrderTotal\n      wouldExceedLimit\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ApproveCustomerCredit($input: ApproveCustomerCreditInput!) {\n    approveCustomerCredit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n',
): (typeof documents)['\n  mutation ApproveCustomerCredit($input: ApproveCustomerCreditInput!) {\n    approveCustomerCredit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateCustomerCreditLimit($input: UpdateCustomerCreditLimitInput!) {\n    updateCustomerCreditLimit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateCustomerCreditLimit($input: UpdateCustomerCreditLimitInput!) {\n    updateCustomerCreditLimit(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateCreditDuration($input: UpdateCreditDurationInput!) {\n    updateCreditDuration(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateCreditDuration($input: UpdateCreditDurationInput!) {\n    updateCreditDuration(input: $input) {\n      customerId\n      isCreditApproved\n      creditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      creditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetUnpaidOrdersForCustomer($customerId: ID!) {\n    unpaidOrdersForCustomer(customerId: $customerId) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      createdAt\n      payments {\n        id\n        state\n        amount\n        method\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetUnpaidOrdersForCustomer($customerId: ID!) {\n    unpaidOrdersForCustomer(customerId: $customerId) {\n      id\n      code\n      state\n      total\n      totalWithTax\n      createdAt\n      payments {\n        id\n        state\n        amount\n        method\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AllocateBulkPayment($input: PaymentAllocationInput!) {\n    allocateBulkPayment(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n',
): (typeof documents)['\n  mutation AllocateBulkPayment($input: PaymentAllocationInput!) {\n    allocateBulkPayment(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation PaySingleOrder($input: PaySingleOrderInput!) {\n    paySingleOrder(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n',
): (typeof documents)['\n  mutation PaySingleOrder($input: PaySingleOrderInput!) {\n    paySingleOrder(input: $input) {\n      ordersPaid {\n        orderId\n        orderCode\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation PaySinglePurchase($input: PaySinglePurchaseInput!) {\n    paySinglePurchase(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n',
): (typeof documents)['\n  mutation PaySinglePurchase($input: PaySinglePurchaseInput!) {\n    paySinglePurchase(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSupplierCreditSummary($supplierId: ID!) {\n    supplierCreditSummary(supplierId: $supplierId) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n',
): (typeof documents)['\n  query GetSupplierCreditSummary($supplierId: ID!) {\n    supplierCreditSummary(supplierId: $supplierId) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ApproveSupplierCredit($input: ApproveSupplierCreditInput!) {\n    approveSupplierCredit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n',
): (typeof documents)['\n  mutation ApproveSupplierCredit($input: ApproveSupplierCreditInput!) {\n    approveSupplierCredit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateSupplierCreditLimit($input: UpdateSupplierCreditLimitInput!) {\n    updateSupplierCreditLimit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateSupplierCreditLimit($input: UpdateSupplierCreditLimitInput!) {\n    updateSupplierCreditLimit(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateSupplierCreditDuration($input: UpdateSupplierCreditDurationInput!) {\n    updateSupplierCreditDuration(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateSupplierCreditDuration($input: UpdateSupplierCreditDurationInput!) {\n    updateSupplierCreditDuration(input: $input) {\n      supplierId\n      isSupplierCreditApproved\n      supplierCreditLimit\n      outstandingAmount\n      availableCredit\n      lastRepaymentDate\n      lastRepaymentAmount\n      supplierCreditDuration\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation AllocateBulkSupplierPayment($input: SupplierPaymentAllocationInput!) {\n    allocateBulkSupplierPayment(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n',
): (typeof documents)['\n  mutation AllocateBulkSupplierPayment($input: SupplierPaymentAllocationInput!) {\n    allocateBulkSupplierPayment(input: $input) {\n      purchasesPaid {\n        purchaseId\n        purchaseReference\n        amountPaid\n      }\n      remainingBalance\n      totalAllocated\n      excessPayment\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetOrderLineCustomPrice($input: SetOrderLineCustomPriceInput!) {\n    setOrderLineCustomPrice(input: $input) {\n      ... on OrderLine {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        customFields {\n          customLinePrice\n          priceOverrideReason\n        }\n        productVariant {\n          id\n          name\n          price\n        }\n      }\n      ... on Error {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation SetOrderLineCustomPrice($input: SetOrderLineCustomPriceInput!) {\n    setOrderLineCustomPrice(input: $input) {\n      ... on OrderLine {\n        id\n        quantity\n        linePrice\n        linePriceWithTax\n        customFields {\n          customLinePrice\n          priceOverrideReason\n        }\n        productVariant {\n          id\n          name\n          price\n        }\n      }\n      ... on Error {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSuppliers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        supplierOutstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n          isSupplierCreditApproved\n          supplierCreditLimit\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetSuppliers($options: CustomerListOptions) {\n    customers(options: $options) {\n      totalItems\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        createdAt\n        updatedAt\n        supplierOutstandingAmount\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n          isSupplierCreditApproved\n          supplierCreditLimit\n        }\n        addresses {\n          id\n          fullName\n          streetLine1\n          streetLine2\n          city\n          postalCode\n          country {\n            code\n            name\n          }\n          phoneNumber\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSupplier($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetSupplier($id: ID!) {\n    customer(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      updatedAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        lastRepaymentDate\n        lastRepaymentAmount\n        creditDuration\n      }\n      addresses {\n        id\n        fullName\n        streetLine1\n        streetLine2\n        city\n        postalCode\n        country {\n          code\n          name\n        }\n        phoneNumber\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateSupplier($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        creditDuration\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateSupplier($input: CreateCustomerInput!, $isWalkIn: Boolean) {\n    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {\n      id\n      firstName\n      lastName\n      emailAddress\n      phoneNumber\n      createdAt\n      customFields {\n        isSupplier\n        supplierType\n        contactPerson\n        taxId\n        paymentTerms\n        notes\n        isCreditApproved\n        creditLimit\n        creditDuration\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateSupplier($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateSupplier($input: UpdateCustomerInput!) {\n    updateCustomer(input: $input) {\n      ... on Customer {\n        id\n        firstName\n        lastName\n        emailAddress\n        phoneNumber\n        updatedAt\n        customFields {\n          isSupplier\n          supplierType\n          contactPerson\n          taxId\n          paymentTerms\n          notes\n          isCreditApproved\n          creditLimit\n          creditDuration\n        }\n      }\n      ... on EmailAddressConflictError {\n        errorCode\n        message\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteSupplier($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation DeleteSupplier($id: ID!) {\n    deleteCustomer(id: $id) {\n      result\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateChannelLogo($logoAssetId: ID) {\n    updateChannelLogo(logoAssetId: $logoAssetId) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateChannelLogo($logoAssetId: ID) {\n    updateChannelLogo(logoAssetId: $logoAssetId) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateCashierSettings($cashierFlowEnabled: Boolean) {\n    updateCashierSettings(cashierFlowEnabled: $cashierFlowEnabled) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateCashierSettings($cashierFlowEnabled: Boolean) {\n    updateCashierSettings(cashierFlowEnabled: $cashierFlowEnabled) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdatePrinterSettings($enablePrinter: Boolean!) {\n    updatePrinterSettings(enablePrinter: $enablePrinter) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdatePrinterSettings($enablePrinter: Boolean!) {\n    updatePrinterSettings(enablePrinter: $enablePrinter) {\n      cashierFlowEnabled\n      enablePrinter\n      companyLogoAsset {\n        id\n        preview\n        source\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation InviteChannelAdministrator($input: InviteAdministratorInput!) {\n    inviteChannelAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation InviteChannelAdministrator($input: InviteAdministratorInput!) {\n    inviteChannelAdministrator(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetRoleTemplates {\n    roleTemplates {\n      code\n      name\n      description\n      permissions\n    }\n  }\n',
): (typeof documents)['\n  query GetRoleTemplates {\n    roleTemplates {\n      code\n      name\n      description\n      permissions\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateChannelAdmin($input: CreateChannelAdminInput!) {\n    createChannelAdmin(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateChannelAdmin($input: CreateChannelAdminInput!) {\n    createChannelAdmin(input: $input) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateChannelAdmin($id: ID!, $permissions: [String!]!) {\n    updateChannelAdmin(id: $id, permissions: $permissions) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateChannelAdmin($id: ID!, $permissions: [String!]!) {\n    updateChannelAdmin(id: $id, permissions: $permissions) {\n      id\n      firstName\n      lastName\n      emailAddress\n      user {\n        id\n        identifier\n        roles {\n          id\n          code\n          permissions\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DisableChannelAdmin($id: ID!) {\n    disableChannelAdmin(id: $id) {\n      success\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation DisableChannelAdmin($id: ID!) {\n    disableChannelAdmin(id: $id) {\n      success\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetAdministrators($options: AdministratorListOptions) {\n    administrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        user {\n          id\n          identifier\n          verified\n          roles {\n            id\n            code\n            permissions\n            channels {\n              id\n            }\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetAdministrators($options: AdministratorListOptions) {\n    administrators(options: $options) {\n      items {\n        id\n        firstName\n        lastName\n        emailAddress\n        user {\n          id\n          identifier\n          verified\n          roles {\n            id\n            code\n            permissions\n            channels {\n              id\n            }\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetAdministratorById($id: ID!) {\n    administrator(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetAdministratorById($id: ID!) {\n    administrator(id: $id) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetAdministratorByUserId($userId: ID!) {\n    administratorByUserId(userId: $userId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetAdministratorByUserId($userId: ID!) {\n    administratorByUserId(userId: $userId) {\n      id\n      firstName\n      lastName\n      emailAddress\n      createdAt\n      updatedAt\n      user {\n        id\n        identifier\n        verified\n        lastLogin\n        roles {\n          id\n          code\n          description\n          permissions\n          channels {\n            id\n            code\n            token\n          }\n        }\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateChannelPaymentMethod($input: CreatePaymentMethodInput!) {\n    createChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateChannelPaymentMethod($input: CreatePaymentMethodInput!) {\n    createChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateChannelPaymentMethod($input: UpdatePaymentMethodInput!) {\n    updateChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n      customFields {\n        imageAsset {\n          id\n          preview\n        }\n        isActive\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateChannelPaymentMethod($input: UpdatePaymentMethodInput!) {\n    updateChannelPaymentMethod(input: $input) {\n      id\n      code\n      name\n      customFields {\n        imageAsset {\n          id\n          preview\n        }\n        isActive\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetAuditLogs($options: AuditLogOptions) {\n    auditLogs(options: $options) {\n      id\n      timestamp\n      channelId\n      eventType\n      entityType\n      entityId\n      userId\n      data\n      source\n    }\n  }\n',
): (typeof documents)['\n  query GetAuditLogs($options: AuditLogOptions) {\n    auditLogs(options: $options) {\n      id\n      timestamp\n      channelId\n      eventType\n      entityType\n      entityId\n      userId\n      data\n      source\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetUserNotifications($options: NotificationListOptions) {\n    getUserNotifications(options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        data\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetUserNotifications($options: NotificationListOptions) {\n    getUserNotifications(options: $options) {\n      items {\n        id\n        userId\n        channelId\n        type\n        title\n        message\n        data\n        read\n        createdAt\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetUnreadCount {\n    getUnreadCount\n  }\n',
): (typeof documents)['\n  query GetUnreadCount {\n    getUnreadCount\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation MarkNotificationAsRead($id: ID!) {\n    markNotificationAsRead(id: $id)\n  }\n',
): (typeof documents)['\n  mutation MarkNotificationAsRead($id: ID!) {\n    markNotificationAsRead(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation MarkAllAsRead {\n    markAllAsRead\n  }\n',
): (typeof documents)['\n  mutation MarkAllAsRead {\n    markAllAsRead\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {\n    subscribeToPush(subscription: $subscription)\n  }\n',
): (typeof documents)['\n  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {\n    subscribeToPush(subscription: $subscription)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UnsubscribeToPush {\n    unsubscribeToPush\n  }\n',
): (typeof documents)['\n  mutation UnsubscribeToPush {\n    unsubscribeToPush\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query GetSubscriptionTiers {\n    getSubscriptionTiers {\n      id\n      code\n      name\n      description\n      priceMonthly\n      priceYearly\n      features\n      isActive\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetChannelSubscription($channelId: ID) {\n    getChannelSubscription(channelId: $channelId) {\n      tier {\n        id\n        code\n        name\n        description\n        priceMonthly\n        priceYearly\n        features\n      }\n      status\n      trialEndsAt\n      subscriptionStartedAt\n      subscriptionExpiresAt\n      billingCycle\n      lastPaymentDate\n      lastPaymentAmount\n    }\n  }\n',
): (typeof documents)['\n  query GetChannelSubscription($channelId: ID) {\n    getChannelSubscription(channelId: $channelId) {\n      tier {\n        id\n        code\n        name\n        description\n        priceMonthly\n        priceYearly\n        features\n      }\n      status\n      trialEndsAt\n      subscriptionStartedAt\n      subscriptionExpiresAt\n      billingCycle\n      lastPaymentDate\n      lastPaymentAmount\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CheckSubscriptionStatus($channelId: ID) {\n    checkSubscriptionStatus(channelId: $channelId) {\n      isValid\n      status\n      daysRemaining\n      expiresAt\n      trialEndsAt\n      canPerformAction\n    }\n  }\n',
): (typeof documents)['\n  query CheckSubscriptionStatus($channelId: ID) {\n    checkSubscriptionStatus(channelId: $channelId) {\n      isValid\n      status\n      daysRemaining\n      expiresAt\n      trialEndsAt\n      canPerformAction\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation InitiateSubscriptionPurchase(\n    $channelId: ID!\n    $tierId: String!\n    $billingCycle: String!\n    $phoneNumber: String!\n    $email: String!\n    $paymentMethod: String\n  ) {\n    initiateSubscriptionPurchase(\n      channelId: $channelId\n      tierId: $tierId\n      billingCycle: $billingCycle\n      phoneNumber: $phoneNumber\n      email: $email\n      paymentMethod: $paymentMethod\n    ) {\n      success\n      reference\n      authorizationUrl\n      message\n    }\n  }\n',
): (typeof documents)['\n  mutation InitiateSubscriptionPurchase(\n    $channelId: ID!\n    $tierId: String!\n    $billingCycle: String!\n    $phoneNumber: String!\n    $email: String!\n    $paymentMethod: String\n  ) {\n    initiateSubscriptionPurchase(\n      channelId: $channelId\n      tierId: $tierId\n      billingCycle: $billingCycle\n      phoneNumber: $phoneNumber\n      email: $email\n      paymentMethod: $paymentMethod\n    ) {\n      success\n      reference\n      authorizationUrl\n      message\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VerifySubscriptionPayment($channelId: ID!, $reference: String!) {\n    verifySubscriptionPayment(channelId: $channelId, reference: $reference)\n  }\n',
): (typeof documents)['\n  mutation VerifySubscriptionPayment($channelId: ID!, $reference: String!) {\n    verifySubscriptionPayment(channelId: $channelId, reference: $reference)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CancelSubscription($channelId: ID!) {\n    cancelSubscription(channelId: $channelId)\n  }\n',
): (typeof documents)['\n  mutation CancelSubscription($channelId: ID!) {\n    cancelSubscription(channelId: $channelId)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RecordPurchase($input: RecordPurchaseInput!) {\n    recordPurchase(input: $input) {\n      id\n      supplierId\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation RecordPurchase($input: RecordPurchaseInput!) {\n    recordPurchase(input: $input) {\n      id\n      supplierId\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetPurchases($options: PurchaseListOptions) {\n    purchases(options: $options) {\n      items {\n        id\n        supplierId\n        status\n        supplier {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        purchaseDate\n        referenceNumber\n        totalCost\n        paymentStatus\n        isCreditPurchase\n        notes\n        lines {\n          id\n          variantId\n          variant {\n            id\n            name\n            product {\n              id\n              name\n            }\n          }\n          quantity\n          unitCost\n          totalCost\n          stockLocationId\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetPurchases($options: PurchaseListOptions) {\n    purchases(options: $options) {\n      items {\n        id\n        supplierId\n        status\n        supplier {\n          id\n          firstName\n          lastName\n          emailAddress\n        }\n        purchaseDate\n        referenceNumber\n        totalCost\n        paymentStatus\n        isCreditPurchase\n        notes\n        lines {\n          id\n          variantId\n          variant {\n            id\n            name\n            product {\n              id\n              name\n            }\n          }\n          quantity\n          unitCost\n          totalCost\n          stockLocationId\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetPurchase($id: ID!) {\n    purchase(id: $id) {\n      id\n      supplierId\n      status\n      supplier {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      isCreditPurchase\n      notes\n      lines {\n        id\n        variantId\n        variant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n        stockLocation {\n          id\n          name\n        }\n      }\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query GetPurchase($id: ID!) {\n    purchase(id: $id) {\n      id\n      supplierId\n      status\n      supplier {\n        id\n        firstName\n        lastName\n        emailAddress\n      }\n      purchaseDate\n      referenceNumber\n      totalCost\n      paymentStatus\n      isCreditPurchase\n      notes\n      lines {\n        id\n        variantId\n        variant {\n          id\n          name\n          product {\n            id\n            name\n          }\n        }\n        quantity\n        unitCost\n        totalCost\n        stockLocationId\n        stockLocation {\n          id\n          name\n        }\n      }\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ConfirmPurchase($id: ID!) {\n    confirmPurchase(id: $id) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      paymentStatus\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation ConfirmPurchase($id: ID!) {\n    confirmPurchase(id: $id) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      paymentStatus\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateDraftPurchase($id: ID!, $input: UpdateDraftPurchaseInput!) {\n    updateDraftPurchase(id: $id, input: $input) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateDraftPurchase($id: ID!, $input: UpdateDraftPurchaseInput!) {\n    updateDraftPurchase(id: $id, input: $input) {\n      id\n      supplierId\n      status\n      referenceNumber\n      totalCost\n      notes\n      lines {\n        id\n        variantId\n        quantity\n        unitCost\n        totalCost\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RecordStockAdjustment($input: RecordStockAdjustmentInput!) {\n    recordStockAdjustment(input: $input) {\n      id\n      reason\n      notes\n      adjustedByUserId\n      lines {\n        id\n        variantId\n        quantityChange\n        previousStock\n        newStock\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation RecordStockAdjustment($input: RecordStockAdjustmentInput!) {\n    recordStockAdjustment(input: $input) {\n      id\n      reason\n      notes\n      adjustedByUserId\n      lines {\n        id\n        variantId\n        quantityChange\n        previousStock\n        newStock\n        stockLocationId\n      }\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetStockAdjustments($options: StockAdjustmentListOptions) {\n    stockAdjustments(options: $options) {\n      items {\n        id\n        reason\n        notes\n        adjustedByUserId\n        lines {\n          id\n          variantId\n          quantityChange\n          previousStock\n          newStock\n          stockLocationId\n          variant {\n            id\n            name\n            sku\n            product {\n              name\n            }\n          }\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetStockAdjustments($options: StockAdjustmentListOptions) {\n    stockAdjustments(options: $options) {\n      items {\n        id\n        reason\n        notes\n        adjustedByUserId\n        lines {\n          id\n          variantId\n          quantityChange\n          previousStock\n          newStock\n          stockLocationId\n          variant {\n            id\n            name\n            sku\n            product {\n              name\n            }\n          }\n          stockLocation {\n            id\n            name\n          }\n        }\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetLedgerAccounts {\n    ledgerAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetLedgerAccounts {\n    ledgerAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetEligibleDebitAccounts {\n    eligibleDebitAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetEligibleDebitAccounts {\n    eligibleDebitAccounts {\n      items {\n        id\n        code\n        name\n        type\n        isActive\n        balance\n        parentAccountId\n        isParent\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RecordExpense($input: RecordExpenseInput!) {\n    recordExpense(input: $input) {\n      sourceId\n    }\n  }\n',
): (typeof documents)['\n  mutation RecordExpense($input: RecordExpenseInput!) {\n    recordExpense(input: $input) {\n      sourceId\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateInterAccountTransfer($input: InterAccountTransferInput!) {\n    createInterAccountTransfer(input: $input) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateInterAccountTransfer($input: InterAccountTransferInput!) {\n    createInterAccountTransfer(input: $input) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetJournalEntries($options: JournalEntriesOptions) {\n    journalEntries(options: $options) {\n      items {\n        id\n        entryDate\n        postedAt\n        sourceType\n        sourceId\n        memo\n        lines {\n          id\n          accountCode\n          accountName\n          debit\n          credit\n          meta\n        }\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetJournalEntries($options: JournalEntriesOptions) {\n    journalEntries(options: $options) {\n      items {\n        id\n        entryDate\n        postedAt\n        sourceType\n        sourceId\n        memo\n        lines {\n          id\n          accountCode\n          accountName\n          debit\n          credit\n          meta\n        }\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetJournalEntry($id: ID!) {\n    journalEntry(id: $id) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetJournalEntry($id: ID!) {\n    journalEntry(id: $id) {\n      id\n      entryDate\n      postedAt\n      sourceType\n      sourceId\n      memo\n      lines {\n        id\n        accountCode\n        accountName\n        debit\n        credit\n        meta\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetChannelReconciliationConfig($channelId: Int!) {\n    channelReconciliationConfig(channelId: $channelId) {\n      paymentMethodId\n      paymentMethodCode\n      reconciliationType\n      ledgerAccountCode\n      isCashierControlled\n      requiresReconciliation\n    }\n  }\n',
): (typeof documents)['\n  query GetChannelReconciliationConfig($channelId: Int!) {\n    channelReconciliationConfig(channelId: $channelId) {\n      paymentMethodId\n      paymentMethodCode\n      reconciliationType\n      ledgerAccountCode\n      isCashierControlled\n      requiresReconciliation\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetShiftModalPrefillData($channelId: Int!) {\n    shiftModalPrefillData(channelId: $channelId) {\n      config {\n        paymentMethodId\n        paymentMethodCode\n        reconciliationType\n        ledgerAccountCode\n        isCashierControlled\n        requiresReconciliation\n      }\n      balances {\n        accountCode\n        accountName\n        balanceCents\n      }\n    }\n  }\n',
): (typeof documents)['\n  query GetShiftModalPrefillData($channelId: Int!) {\n    shiftModalPrefillData(channelId: $channelId) {\n      config {\n        paymentMethodId\n        paymentMethodCode\n        reconciliationType\n        ledgerAccountCode\n        isCashierControlled\n        requiresReconciliation\n      }\n      balances {\n        accountCode\n        accountName\n        balanceCents\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCurrentCashierSession($channelId: Int!) {\n    currentCashierSession(channelId: $channelId) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      closedAt\n      closingDeclared\n      status\n    }\n  }\n',
): (typeof documents)['\n  query GetCurrentCashierSession($channelId: Int!) {\n    currentCashierSession(channelId: $channelId) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      closedAt\n      closingDeclared\n      status\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCashierSession($sessionId: String!) {\n    cashierSession(sessionId: $sessionId) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n',
): (typeof documents)['\n  query GetCashierSession($sessionId: String!) {\n    cashierSession(sessionId: $sessionId) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetCashierSessions($channelId: Int!, $options: CashierSessionListOptions) {\n    cashierSessions(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        cashierUserId\n        openedAt\n        closedAt\n        closingDeclared\n        status\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetCashierSessions($channelId: Int!, $options: CashierSessionListOptions) {\n    cashierSessions(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        cashierUserId\n        openedAt\n        closedAt\n        closingDeclared\n        status\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation OpenCashierSession($input: OpenCashierSessionInput!) {\n    openCashierSession(input: $input) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      status\n    }\n  }\n',
): (typeof documents)['\n  mutation OpenCashierSession($input: OpenCashierSessionInput!) {\n    openCashierSession(input: $input) {\n      id\n      channelId\n      cashierUserId\n      openedAt\n      status\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CloseCashierSession($input: CloseCashierSessionInput!) {\n    closeCashierSession(input: $input) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n',
): (typeof documents)['\n  mutation CloseCashierSession($input: CloseCashierSessionInput!) {\n    closeCashierSession(input: $input) {\n      sessionId\n      cashierUserId\n      openedAt\n      closedAt\n      status\n      openingFloat\n      closingDeclared\n      ledgerTotals {\n        cashTotal\n        mpesaTotal\n        totalCollected\n      }\n      variance\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateCashierSessionReconciliation($sessionId: String!, $notes: String) {\n    createCashierSessionReconciliation(sessionId: $sessionId, notes: $notes) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateCashierSessionReconciliation($sessionId: String!, $notes: String) {\n    createCashierSessionReconciliation(sessionId: $sessionId, notes: $notes) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateReconciliation($input: CreateReconciliationInput!) {\n    createReconciliation(input: $input) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateReconciliation($input: CreateReconciliationInput!) {\n    createReconciliation(input: $input) {\n      id\n      channelId\n      scope\n      scopeRefId\n      snapshotAt\n      status\n      expectedBalance\n      actualBalance\n      varianceAmount\n      notes\n      createdBy\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetReconciliations($channelId: Int!, $options: ReconciliationListOptions) {\n    reconciliations(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        scope\n        scopeRefId\n        snapshotAt\n        status\n        expectedBalance\n        actualBalance\n        varianceAmount\n        notes\n        createdBy\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetReconciliations($channelId: Int!, $options: ReconciliationListOptions) {\n    reconciliations(channelId: $channelId, options: $options) {\n      items {\n        id\n        channelId\n        scope\n        scopeRefId\n        snapshotAt\n        status\n        expectedBalance\n        actualBalance\n        varianceAmount\n        notes\n        createdBy\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetReconciliationDetails($reconciliationId: String!) {\n    reconciliationDetails(reconciliationId: $reconciliationId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n',
): (typeof documents)['\n  query GetReconciliationDetails($reconciliationId: String!) {\n    reconciliationDetails(reconciliationId: $reconciliationId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSessionReconciliationDetails($sessionId: String!, $kind: String, $channelId: Int) {\n    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind, channelId: $channelId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n',
): (typeof documents)['\n  query GetSessionReconciliationDetails($sessionId: String!, $kind: String, $channelId: Int) {\n    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind, channelId: $channelId) {\n      accountId\n      accountCode\n      accountName\n      declaredAmountCents\n      expectedBalanceCents\n      varianceCents\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetAccountBalancesAsOf($channelId: Int!, $asOfDate: String!) {\n    accountBalancesAsOf(channelId: $channelId, asOfDate: $asOfDate) {\n      accountId\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n',
): (typeof documents)['\n  query GetAccountBalancesAsOf($channelId: Int!, $asOfDate: String!) {\n    accountBalancesAsOf(channelId: $channelId, asOfDate: $asOfDate) {\n      accountId\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetLastClosedSessionClosingBalances($channelId: Int!) {\n    lastClosedSessionClosingBalances(channelId: $channelId) {\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n',
): (typeof documents)['\n  query GetLastClosedSessionClosingBalances($channelId: Int!) {\n    lastClosedSessionClosingBalances(channelId: $channelId) {\n      accountCode\n      accountName\n      balanceCents\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetExpectedSessionClosingBalances($sessionId: String!) {\n    expectedSessionClosingBalances(sessionId: $sessionId) {\n      accountCode\n      accountName\n      expectedBalanceCents\n    }\n  }\n',
): (typeof documents)['\n  query GetExpectedSessionClosingBalances($sessionId: String!) {\n    expectedSessionClosingBalances(sessionId: $sessionId) {\n      accountCode\n      accountName\n      expectedBalanceCents\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSessionCashCounts($sessionId: String!) {\n    sessionCashCounts(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n      countedByUserId\n    }\n  }\n',
): (typeof documents)['\n  query GetSessionCashCounts($sessionId: String!) {\n    sessionCashCounts(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n      countedByUserId\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetPendingVarianceReviews($channelId: Int!) {\n    pendingVarianceReviews(channelId: $channelId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      countedByUserId\n    }\n  }\n',
): (typeof documents)['\n  query GetPendingVarianceReviews($channelId: Int!) {\n    pendingVarianceReviews(channelId: $channelId) {\n      id\n      channelId\n      sessionId\n      countType\n      takenAt\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      countedByUserId\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetSessionMpesaVerifications($sessionId: String!) {\n    sessionMpesaVerifications(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n      verifiedByUserId\n    }\n  }\n',
): (typeof documents)['\n  query GetSessionMpesaVerifications($sessionId: String!) {\n    sessionMpesaVerifications(sessionId: $sessionId) {\n      id\n      channelId\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n      verifiedByUserId\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RecordCashCount($input: RecordCashCountInput!) {\n    recordCashCount(input: $input) {\n      count {\n        id\n        sessionId\n        countType\n        takenAt\n        declaredCash\n        varianceReason\n        countedByUserId\n      }\n      hasVariance\n      varianceHidden\n    }\n  }\n',
): (typeof documents)['\n  mutation RecordCashCount($input: RecordCashCountInput!) {\n    recordCashCount(input: $input) {\n      count {\n        id\n        sessionId\n        countType\n        takenAt\n        declaredCash\n        varianceReason\n        countedByUserId\n      }\n      hasVariance\n      varianceHidden\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ExplainVariance($countId: String!, $reason: String!) {\n    explainVariance(countId: $countId, reason: $reason) {\n      id\n      varianceReason\n    }\n  }\n',
): (typeof documents)['\n  mutation ExplainVariance($countId: String!, $reason: String!) {\n    explainVariance(countId: $countId, reason: $reason) {\n      id\n      varianceReason\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ReviewCashCount($countId: String!, $notes: String) {\n    reviewCashCount(countId: $countId, notes: $notes) {\n      id\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n    }\n  }\n',
): (typeof documents)['\n  mutation ReviewCashCount($countId: String!, $notes: String) {\n    reviewCashCount(countId: $countId, notes: $notes) {\n      id\n      declaredCash\n      expectedCash\n      variance\n      varianceReason\n      reviewedByUserId\n      reviewedAt\n      reviewNotes\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VerifyMpesaTransactions($input: VerifyMpesaInput!) {\n    verifyMpesaTransactions(input: $input) {\n      id\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n    }\n  }\n',
): (typeof documents)['\n  mutation VerifyMpesaTransactions($input: VerifyMpesaInput!) {\n    verifyMpesaTransactions(input: $input) {\n      id\n      sessionId\n      verifiedAt\n      transactionCount\n      allConfirmed\n      flaggedTransactionIds\n      notes\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetApprovalRequests($options: ApprovalRequestListOptions) {\n    getApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetApprovalRequests($options: ApprovalRequestListOptions) {\n    getApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetApprovalRequest($id: ID!) {\n    getApprovalRequest(id: $id) {\n      id\n      channelId\n      type\n      status\n      dueAt\n      requestedById\n      reviewedById\n      reviewedAt\n      message\n      rejectionReasonCode\n      metadata\n      entityType\n      entityId\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query GetApprovalRequest($id: ID!) {\n    getApprovalRequest(id: $id) {\n      id\n      channelId\n      type\n      status\n      dueAt\n      requestedById\n      reviewedById\n      reviewedAt\n      message\n      rejectionReasonCode\n      metadata\n      entityType\n      entityId\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetMyApprovalRequests($options: ApprovalRequestListOptions) {\n    getMyApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n',
): (typeof documents)['\n  query GetMyApprovalRequests($options: ApprovalRequestListOptions) {\n    getMyApprovalRequests(options: $options) {\n      items {\n        id\n        channelId\n        type\n        status\n        dueAt\n        requestedById\n        reviewedById\n        reviewedAt\n        message\n        rejectionReasonCode\n        metadata\n        entityType\n        entityId\n        createdAt\n        updatedAt\n      }\n      totalItems\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateApprovalRequest($input: CreateApprovalRequestInput!) {\n    createApprovalRequest(input: $input) {\n      id\n      type\n      status\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateApprovalRequest($input: CreateApprovalRequestInput!) {\n    createApprovalRequest(input: $input) {\n      id\n      type\n      status\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ReviewApprovalRequest($input: ReviewApprovalRequestInput!) {\n    reviewApprovalRequest(input: $input) {\n      id\n      type\n      status\n      message\n      reviewedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation ReviewApprovalRequest($input: ReviewApprovalRequestInput!) {\n    reviewApprovalRequest(input: $input) {\n      id\n      type\n      status\n      message\n      reviewedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query GetAnalyticsStats($timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStats(timeRange: $timeRange, limit: $limit) {\n      topSelling {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n        quantityChangePercent\n      }\n      highestRevenue {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      highestMargin {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      trending {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        quantityChangePercent\n      }\n      salesTrend {\n        date\n        value\n      }\n      orderVolumeTrend {\n        date\n        value\n      }\n      customerGrowthTrend {\n        date\n        value\n      }\n      averageProfitMargin\n      totalRevenue\n      totalOrders\n    }\n  }\n',
): (typeof documents)['\n  query GetAnalyticsStats($timeRange: AnalyticsTimeRange!, $limit: Int) {\n    analyticsStats(timeRange: $timeRange, limit: $limit) {\n      topSelling {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n        quantityChangePercent\n      }\n      highestRevenue {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      highestMargin {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        totalRevenue\n        totalMargin\n        marginPercent\n      }\n      trending {\n        productVariantId\n        productId\n        productName\n        variantName\n        totalQuantity\n        quantityChangePercent\n      }\n      salesTrend {\n        date\n        value\n      }\n      orderVolumeTrend {\n        date\n        value\n      }\n      customerGrowthTrend {\n        date\n        value\n      }\n      averageProfitMargin\n      totalRevenue\n      totalOrders\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RefreshAnalytics {\n    refreshAnalytics\n  }\n',
): (typeof documents)['\n  mutation RefreshAnalytics {\n    refreshAnalytics\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n      mutation UpdateProductBasic($id: ID!, $name: String!, $slug: String!, $barcode: String) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    ',
): (typeof documents)['\n      mutation UpdateProductBasic($id: ID!, $name: String!, $slug: String!, $barcode: String) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    '];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n      mutation UpdateProductWithFacets(\n        $id: ID!\n        $name: String!\n        $slug: String!\n        $barcode: String\n        $facetValueIds: [ID!]!\n      ) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n            facetValueIds: $facetValueIds\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    ',
): (typeof documents)['\n      mutation UpdateProductWithFacets(\n        $id: ID!\n        $name: String!\n        $slug: String!\n        $barcode: String\n        $facetValueIds: [ID!]!\n      ) {\n        updateProduct(\n          input: {\n            id: $id\n            translations: [{ languageCode: en, name: $name, slug: $slug }]\n            customFields: { barcode: $barcode }\n            facetValueIds: $facetValueIds\n          }\n        ) {\n          id\n          name\n          slug\n          customFields {\n            barcode\n          }\n        }\n      }\n    '];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
