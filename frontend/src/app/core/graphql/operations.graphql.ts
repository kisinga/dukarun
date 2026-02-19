import { graphql } from './generated';

/**
 * ============================================================================
 * ALL GRAPHQL OPERATIONS - SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This file contains ALL GraphQL queries and mutations used in the application.
 * Organized by domain for easy navigation.
 *
 * WHY ONE FILE?
 * - No circular dependencies
 * - No codegen bootstrapping issues
 * - Easy to find and maintain all operations
 * - Single import point for services
 * - Guaranteed type generation
 *
 * The graphql() function returns typed DocumentNodes that codegen processes.
 */

// ============================================================================
// AUTHENTICATION & USER MANAGEMENT
// ============================================================================

export const GET_ACTIVE_ADMIN = graphql(`
  query GetActiveAdministrator {
    activeAdministrator {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
      customFields {
        profilePicture {
          id
          preview
          source
        }
      }
    }
  }
`);

// Legacy login mutation (kept for backward compatibility during transition)
export const LOGIN = graphql(`
  mutation Login($username: String!, $password: String!, $rememberMe: Boolean) {
    login(username: $username, password: $password, rememberMe: $rememberMe) {
      ... on CurrentUser {
        id
        identifier
        channels {
          id
          code
          token
        }
      }
      ... on InvalidCredentialsError {
        errorCode
        message
      }
      ... on NativeAuthStrategyError {
        errorCode
        message
      }
    }
  }
`);

// Phone-based OTP authentication mutations
export const REQUEST_REGISTRATION_OTP = graphql(`
  mutation RequestRegistrationOTP($phoneNumber: String!, $registrationData: RegistrationInput!) {
    requestRegistrationOTP(phoneNumber: $phoneNumber, registrationData: $registrationData) {
      success
      message
      sessionId
      expiresAt
    }
  }
`);

export const VERIFY_REGISTRATION_OTP = graphql(`
  mutation VerifyRegistrationOTP($phoneNumber: String!, $otp: String!, $sessionId: String!) {
    verifyRegistrationOTP(phoneNumber: $phoneNumber, otp: $otp, sessionId: $sessionId) {
      success
      userId
      message
    }
  }
`);

export const REQUEST_LOGIN_OTP = graphql(`
  mutation RequestLoginOTP($phoneNumber: String!) {
    requestLoginOTP(phoneNumber: $phoneNumber) {
      success
      message
      expiresAt
    }
  }
`);

export const VERIFY_LOGIN_OTP = graphql(`
  mutation VerifyLoginOTP($phoneNumber: String!, $otp: String!) {
    verifyLoginOTP(phoneNumber: $phoneNumber, otp: $otp) {
      success
      token
      user {
        id
        identifier
      }
      message
    }
  }
`);

export const CHECK_AUTHORIZATION_STATUS = graphql(`
  query CheckAuthorizationStatus($identifier: String!) {
    checkAuthorizationStatus(identifier: $identifier) {
      status
      message
    }
  }
`);

export const CHECK_COMPANY_CODE_AVAILABILITY = graphql(`
  query CheckCompanyCodeAvailability($companyCode: String!) {
    checkCompanyCodeAvailability(companyCode: $companyCode)
  }
`);

export const LOGOUT = graphql(`
  mutation Logout {
    logout {
      success
    }
  }
`);

export const UPDATE_ADMINISTRATOR = graphql(`
  mutation UpdateAdministrator($input: UpdateActiveAdministratorInput!) {
    updateActiveAdministrator(input: $input) {
      id
      firstName
      lastName
      emailAddress
      customFields {
        profilePicture {
          id
          preview
          source
        }
      }
    }
  }
`);

export const UPDATE_ADMIN_PROFILE = graphql(`
  mutation UpdateAdminProfile($input: UpdateAdminProfileInput!) {
    updateAdminProfile(input: $input) {
      id
      firstName
      lastName
    }
  }
`);

export const GET_USER_CHANNELS = graphql(`
  query GetUserChannels {
    me {
      id
      identifier
      channels {
        id
        code
        token
      }
    }
  }
`);

export const GET_ACTIVE_CHANNEL = graphql(`
  query GetActiveChannel {
    activeChannel {
      id
      code
      token
      defaultCurrencyCode
      customFields {
        mlModelJsonAsset {
          id
          source
          name
        }
        mlModelBinAsset {
          id
          source
          name
        }
        mlMetadataAsset {
          id
          source
          name
        }
        companyLogoAsset {
          id
          source
          name
          preview
        }
        cashierFlowEnabled
        enablePrinter
        subscriptionStatus
        trialEndsAt
        subscriptionExpiresAt
      }
    }
  }
`);

// ============================================================================
// PRODUCT MANAGEMENT
// ============================================================================

export const GET_STOCK_LOCATIONS = graphql(`
  query GetStockLocations {
    stockLocations(options: { take: 100 }) {
      items {
        id
        name
        description
      }
    }
  }
`);

export const CHECK_SKU_EXISTS = graphql(`
  query CheckSkuExists($sku: String!) {
    productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {
      items {
        id
        sku
        product {
          id
          name
        }
      }
    }
  }
`);

// Note: This query is automatically channel-scoped by Vendure's RequestContext.
// Products are filtered to the active channel, so barcode uniqueness is checked
// within the current channel only (multi-vendor support).
export const CHECK_BARCODE_EXISTS = graphql(`
  query CheckBarcodeExists($barcode: String!) {
    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {
      items {
        id
        name
        customFields {
          barcode
        }
      }
    }
  }
`);

export const CREATE_PRODUCT = graphql(`
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      id
      name
      slug
      description
      enabled
      featuredAsset {
        id
        preview
      }
      variants {
        id
        name
        sku
        price
        stockOnHand
        customFields {
          wholesalePrice
          allowFractionalQuantity
        }
      }
    }
  }
`);

export const CREATE_PRODUCT_VARIANTS = graphql(`
  mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
    createProductVariants(input: $input) {
      id
      name
      sku
      price
      priceWithTax
      stockOnHand
      product {
        id
        name
      }
    }
  }
`);

export const DELETE_PRODUCT_VARIANTS = graphql(`
  mutation DeleteProductVariants($ids: [ID!]!) {
    deleteProductVariants(ids: $ids) {
      result
      message
    }
  }
`);

export const CREATE_ASSETS = graphql(`
  mutation CreateAssets($input: [CreateAssetInput!]!) {
    createAssets(input: $input) {
      ... on Asset {
        id
        name
        preview
        source
      }
    }
  }
`);

export const ASSIGN_ASSETS_TO_PRODUCT = graphql(`
  mutation AssignAssetsToProduct($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {
    updateProduct(
      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }
    ) {
      id
      assets {
        id
        name
        preview
      }
      featuredAsset {
        id
        preview
      }
    }
  }
`);

export const ASSIGN_ASSETS_TO_CHANNEL = graphql(`
  mutation AssignAssetsToChannel($assetIds: [ID!]!, $channelId: ID!) {
    assignAssetsToChannel(input: { assetIds: $assetIds, channelId: $channelId }) {
      id
      name
    }
  }
`);

export const DELETE_ASSET = graphql(`
  mutation DeleteAsset($input: DeleteAssetInput!) {
    deleteAsset(input: $input) {
      result
      message
    }
  }
`);

export const UPDATE_PRODUCT_ASSETS = graphql(`
  mutation UpdateProductAssets($productId: ID!, $assetIds: [ID!]!, $featuredAssetId: ID) {
    updateProduct(
      input: { id: $productId, assetIds: $assetIds, featuredAssetId: $featuredAssetId }
    ) {
      id
      assets {
        id
        name
        preview
        source
      }
      featuredAsset {
        id
        preview
      }
    }
  }
`);

export const GET_PRODUCT_DETAIL = graphql(`
  query GetProductDetail($id: ID!) {
    product(id: $id) {
      id
      name
      slug
      description
      enabled
      customFields {
        barcode
      }
      facetValues {
        id
        name
        code
        facet {
          id
          code
        }
      }
      assets {
        id
        name
        preview
        source
      }
      featuredAsset {
        id
        preview
      }
      variants {
        id
        name
        sku
        price
        priceWithTax
        stockOnHand
        trackInventory
        customFields {
          wholesalePrice
          allowFractionalQuantity
        }
        prices {
          price
          currencyCode
        }
        stockLevels {
          id
          stockOnHand
          stockLocation {
            id
            name
          }
        }
      }
    }
  }
`);

export const GET_PRODUCTS = graphql(`
  query GetProducts($options: ProductListOptions) {
    products(options: $options) {
      totalItems
      items {
        id
        name
        slug
        description
        enabled
        featuredAsset {
          id
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          price
          priceWithTax
          stockOnHand
          trackInventory
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
          prices {
            price
            currencyCode
          }
        }
      }
    }
  }
`);

export const DELETE_PRODUCT = graphql(`
  mutation DeleteProduct($id: ID!) {
    deleteProduct(id: $id) {
      result
      message
    }
  }
`);

export const CREATE_PRODUCT_OPTION_GROUP = graphql(`
  mutation CreateProductOptionGroup($input: CreateProductOptionGroupInput!) {
    createProductOptionGroup(input: $input) {
      id
      code
      name
      options {
        id
        code
        name
      }
    }
  }
`);

export const CREATE_PRODUCT_OPTION = graphql(`
  mutation CreateProductOption($input: CreateProductOptionInput!) {
    createProductOption(input: $input) {
      id
      code
      name
      group {
        id
        name
      }
    }
  }
`);

export const ADD_OPTION_GROUP_TO_PRODUCT = graphql(`
  mutation AddOptionGroupToProduct($productId: ID!, $optionGroupId: ID!) {
    addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) {
      id
      name
      optionGroups {
        id
        code
        name
        options {
          id
          code
          name
        }
      }
    }
  }
`);

export const UPDATE_PRODUCT_VARIANT = graphql(`
  mutation UpdateProductVariant($input: UpdateProductVariantInput!) {
    updateProductVariant(input: $input) {
      id
      name
      sku
      price
      priceWithTax
      stockOnHand
      product {
        id
        name
      }
    }
  }
`);

// ============================================================================
// PRODUCT SEARCH & CACHE (POS)
// ============================================================================

export const SEARCH_PRODUCTS = graphql(`
  query SearchProducts($term: String!) {
    products(options: { filter: { name: { contains: $term } }, take: 5 }) {
      items {
        id
        name
        featuredAsset {
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          price
          priceWithTax
          stockOnHand
          trackInventory
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
          prices {
            price
            currencyCode
          }
        }
      }
    }
  }
`);

export const GET_PRODUCT = graphql(`
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      featuredAsset {
        preview
      }
      facetValues {
        id
        name
        facet {
          code
        }
      }
      variants {
        id
        name
        sku
        price
        priceWithTax
        trackInventory
        prices {
          price
          currencyCode
        }
        stockLevels {
          stockLocationId
          stockOnHand
        }
        customFields {
          wholesalePrice
          allowFractionalQuantity
        }
      }
    }
  }
`);

export const GET_VARIANT_STOCK_LEVEL = graphql(`
  query GetVariantStockLevel($variantId: ID!) {
    productVariant(id: $variantId) {
      id
      name
      sku
      stockOnHand
      stockLevels {
        id
        stockOnHand
        stockLocation {
          id
          name
        }
      }
    }
  }
`);

export const SEARCH_BY_BARCODE = graphql(`
  query SearchByBarcode($barcode: String!) {
    products(options: { filter: { barcode: { eq: $barcode } }, take: 1 }) {
      items {
        id
        name
        customFields {
          barcode
        }
        featuredAsset {
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          priceWithTax
          stockOnHand
          trackInventory
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
        }
      }
    }
  }
`);

export const PREFETCH_PRODUCTS = graphql(`
  query PrefetchProducts($take: Int!, $skip: Int) {
    products(options: { take: $take, skip: $skip }) {
      totalItems
      items {
        id
        name
        enabled
        featuredAsset {
          preview
        }
        facetValues {
          id
          name
          facet {
            code
          }
        }
        variants {
          id
          name
          sku
          price
          priceWithTax
          stockOnHand
          customFields {
            wholesalePrice
            allowFractionalQuantity
          }
          prices {
            price
            currencyCode
          }
        }
      }
    }
  }
`);

// ============================================================================
// FACETS (Manufacturer, Category, Tags)
// ============================================================================

export const GET_FACETS_BY_CODES = graphql(`
  query GetFacetsByCodes($codes: [String!]!) {
    facets(options: { filter: { code: { in: $codes } }, take: 10 }) {
      items {
        id
        code
        name
      }
    }
  }
`);

export const GET_FACET_VALUES = graphql(`
  query GetFacetValues($facetId: String!, $term: String) {
    facetValues(
      options: { filter: { facetId: { eq: $facetId }, name: { contains: $term } }, take: 20 }
    ) {
      items {
        id
        name
        code
      }
    }
  }
`);

export const CREATE_FACET = graphql(`
  mutation CreateFacet($input: CreateFacetInput!) {
    createFacet(input: $input) {
      id
      code
      name
    }
  }
`);

export const CREATE_FACET_VALUE = graphql(`
  mutation CreateFacetValue($input: CreateFacetValueInput!) {
    createFacetValue(input: $input) {
      id
      name
      code
    }
  }
`);

// ============================================================================
// DASHBOARD & ANALYTICS
// ============================================================================

export const GET_ORDERS_FOR_PERIOD = graphql(`
  query GetOrdersForPeriod($startDate: DateTime!) {
    orders(options: { filter: { orderPlacedAt: { after: $startDate } }, take: 100 }) {
      items {
        id
        total
        totalWithTax
        orderPlacedAt
        state
        payments {
          id
          amount
          method
          state
        }
      }
    }
  }
`);

export const GET_DASHBOARD_STATS = graphql(`
  query GetDashboardStats($startDate: DateTime, $endDate: DateTime) {
    dashboardStats(startDate: $startDate, endDate: $endDate) {
      sales {
        today
        week
        month
        accounts {
          label
          value
          icon
        }
      }
      purchases {
        today
        week
        month
        accounts {
          label
          value
          icon
        }
      }
      expenses {
        today
        week
        month
        accounts {
          label
          value
          icon
        }
      }
      salesSummary {
        today {
          revenue
          cogs
          margin
          orderCount
        }
        week {
          revenue
          cogs
          margin
          orderCount
        }
        month {
          revenue
          cogs
          margin
          orderCount
        }
      }
    }
  }
`);

export const GET_STOCK_VALUE_STATS = graphql(`
  query GetStockValueStats($stockLocationId: ID, $forceRefresh: Boolean) {
    stockValueStats(stockLocationId: $stockLocationId, forceRefresh: $forceRefresh) {
      retail
      wholesale
      cost
    }
  }
`);

export const GET_STOCK_VALUE_RANKING = graphql(`
  query GetStockValueRanking(
    $valuationType: StockValuationType!
    $limit: Int
    $stockLocationId: ID
  ) {
    stockValueRanking(
      valuationType: $valuationType
      limit: $limit
      stockLocationId: $stockLocationId
    ) {
      items {
        productVariantId
        productId
        productName
        variantName
        value
      }
      total
    }
  }
`);

export const GET_PRODUCT_STATS = graphql(`
  query GetProductStats {
    products(options: { take: 1 }) {
      totalItems
    }
    productVariants(options: { take: 1 }) {
      totalItems
    }
  }
`);

export const GET_RECENT_ORDERS = graphql(`
  query GetRecentOrders {
    orders(options: { take: 10, sort: { createdAt: DESC } }) {
      items {
        id
        code
        total
        totalWithTax
        state
        createdAt
        orderPlacedAt
        currencyCode
        customer {
          id
          firstName
          lastName
          emailAddress
        }
        lines {
          id
          quantity
          productVariant {
            id
            name
            sku
            product {
              id
              name
            }
          }
        }
        payments {
          id
          state
          amount
          method
          createdAt
        }
      }
    }
  }
`);

// ============================================================================
// ORDER MANAGEMENT (Admin API)
// ============================================================================

export const CREATE_DRAFT_ORDER = graphql(`
  mutation CreateDraftOrder {
    createDraftOrder {
      id
      code
      state
      total
      totalWithTax
    }
  }
`);

export const CREATE_ORDER = graphql(`
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      code
      state
      total
      totalWithTax
      customer {
        id
        firstName
        lastName
        emailAddress
      }
      lines {
        id
        quantity
        linePrice
        linePriceWithTax
        productVariant {
          id
          name
        }
      }
      payments {
        id
        state
        amount
        method
        metadata
      }
    }
  }
`);

export const ADD_ITEM_TO_DRAFT_ORDER = graphql(`
  mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {
    addItemToDraftOrder(orderId: $orderId, input: $input) {
      ... on Order {
        id
        code
        state
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const REMOVE_DRAFT_ORDER_LINE = graphql(`
  mutation RemoveDraftOrderLine($orderId: ID!, $orderLineId: ID!) {
    removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const ADJUST_DRAFT_ORDER_LINE = graphql(`
  mutation AdjustDraftOrderLine($orderId: ID!, $input: AdjustDraftOrderLineInput!) {
    adjustDraftOrderLine(orderId: $orderId, input: $input) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
          }
        }
      }
    }
  }
`);

export const ADD_MANUAL_PAYMENT_TO_ORDER = graphql(`
  mutation AddManualPaymentToOrder($input: ManualPaymentInput!) {
    addManualPaymentToOrder(input: $input) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        payments {
          id
          state
          amount
          method
          metadata
        }
      }
      ... on ManualPaymentStateError {
        errorCode
        message
      }
    }
  }
`);

export const SET_CUSTOMER_FOR_DRAFT_ORDER = graphql(`
  mutation SetCustomerForDraftOrder($orderId: ID!, $customerId: ID!) {
    setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        customer {
          id
          firstName
          lastName
          emailAddress
        }
      }
      ... on EmailAddressConflictError {
        errorCode
        message
      }
    }
  }
`);

export const SET_DRAFT_ORDER_SHIPPING_METHOD = graphql(`
  mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {
    setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        shippingLines {
          id
          shippingMethod {
            id
            name
            code
          }
        }
      }
      ... on OrderModificationError {
        errorCode
        message
      }
    }
  }
`);

export const SET_DRAFT_ORDER_BILLING_ADDRESS = graphql(`
  mutation SetDraftOrderBillingAddress($orderId: ID!, $input: CreateAddressInput!) {
    setDraftOrderBillingAddress(orderId: $orderId, input: $input) {
      id
      code
      state
      total
      totalWithTax
      billingAddress {
        fullName
        streetLine1
        city
        postalCode
        country
      }
    }
  }
`);

export const SET_DRAFT_ORDER_SHIPPING_ADDRESS = graphql(`
  mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {
    setDraftOrderShippingAddress(orderId: $orderId, input: $input) {
      id
      code
      state
      total
      totalWithTax
      shippingAddress {
        fullName
        streetLine1
        city
        postalCode
        country
      }
    }
  }
`);

export const TRANSITION_ORDER_TO_STATE = graphql(`
  mutation TransitionOrderToState($id: ID!, $state: String!) {
    transitionOrderToState(id: $id, state: $state) {
      ... on Order {
        id
        code
        state
        total
        totalWithTax
        lines {
          id
          quantity
          linePrice
          productVariant {
            id
            name
          }
        }
      }
      ... on OrderStateTransitionError {
        errorCode
        message
        transitionError
      }
    }
  }
`);

export const VOID_ORDER = graphql(`
  mutation VoidOrder($orderId: ID!) {
    voidOrder(orderId: $orderId) {
      order {
        id
        code
        state
      }
      hadPayments
    }
  }
`);

export const ADD_FULFILLMENT_TO_ORDER = graphql(`
  mutation AddFulfillmentToOrder($input: FulfillOrderInput!) {
    addFulfillmentToOrder(input: $input) {
      ... on Fulfillment {
        id
        state
        nextStates
        createdAt
        updatedAt
        method
        lines {
          orderLineId
          quantity
        }
        trackingCode
      }
      ... on CreateFulfillmentError {
        errorCode
        message
        fulfillmentHandlerError
      }
      ... on FulfillmentStateTransitionError {
        errorCode
        message
        transitionError
      }
    }
  }
`);

// Note: These payment operations are not yet implemented in the backend
// They are placeholders for future cashier flow implementation
// export const ADD_PAYMENT_TO_ORDER = graphql(`
//   mutation AddPaymentToOrder($input: AddPaymentToOrderInput!) {
//     addPaymentToOrder(input: $input) {
//       ... on Order {
//         id
//         code
//         state
//         total
//         totalWithTax
//         payments {
//           id
//           amount
//           state
//           method
//           transactionId
//         }
//       }
//       ... on PaymentFailedError {
//         paymentErrorMessage
//       }
//       ... on PaymentDeclinedError {
//         paymentErrorMessage
//       }
//       ... on IneligiblePaymentMethodError {
//         eligibilityCheckerMessage
//       }
//     }
//   }
// `);

// export const SETTLE_ORDER_PAYMENT = graphql(`
//   mutation SettleOrderPayment($orderId: ID!) {
//     settleOrderPayment(orderId: $orderId) {
//       ... on Order {
//         id
//         code
//         state
//         total
//         totalWithTax
//         payments {
//           id
//           amount
//           state
//           method
//           transactionId
//         }
//       }
//       ... on PaymentFailedError {
//         paymentErrorMessage
//       }
//       ... on PaymentSettlementError {
//         settlementErrorMessage
//       }
//     }
//   }
// `);

export const GET_PAYMENT_METHODS = graphql(`
  query GetPaymentMethods {
    paymentMethods(options: { take: 100 }) {
      items {
        id
        code
        name
        description
        enabled
        customFields {
          imageAsset {
            id
            source
            name
            preview
          }
          isActive
        }
      }
    }
  }
`);

export const GET_ORDER_DETAILS = graphql(`
  query GetOrderDetails($id: ID!) {
    order(id: $id) {
      id
      code
      state
      lines {
        id
        quantity
        productVariant {
          id
          name
          sku
        }
      }
    }
  }
`);

export const GET_ORDER = graphql(`
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      code
      state
      total
      totalWithTax
      lines {
        id
        quantity
        linePrice
        linePriceWithTax
        productVariant {
          id
          name
        }
      }
    }
  }
`);

export const GET_ORDERS = graphql(`
  query GetOrders($options: OrderListOptions) {
    orders(options: $options) {
      items {
        id
        code
        state
        createdAt
        updatedAt
        orderPlacedAt
        total
        totalWithTax
        currencyCode
        customer {
          id
          firstName
          lastName
          emailAddress
        }
        lines {
          id
          quantity
          linePrice
          linePriceWithTax
          productVariant {
            id
            name
            sku
          }
        }
        payments {
          id
          state
          amount
          method
          createdAt
        }
        customFields {
          reversedAt
        }
      }
      totalItems
    }
  }
`);

export const GET_PAYMENTS = graphql(`
  query GetPayments($options: OrderListOptions) {
    orders(options: $options) {
      items {
        id
        code
        state
        createdAt
        orderPlacedAt
        payments {
          id
          state
          amount
          method
          transactionId
          createdAt
          updatedAt
          errorMessage
          metadata
        }
        customer {
          id
          firstName
          lastName
          emailAddress
        }
      }
      totalItems
    }
  }
`);

export const GET_PAYMENT_FULL = graphql(`
  query GetPaymentFull($orderId: ID!) {
    order(id: $orderId) {
      id
      code
      state
      createdAt
      orderPlacedAt
      total
      totalWithTax
      currencyCode
      customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
      }
      payments {
        id
        state
        amount
        method
        transactionId
        createdAt
        updatedAt
        errorMessage
        metadata
        nextStates
        refunds {
          id
          total
          state
          reason
          createdAt
        }
      }
    }
  }
`);

export const GET_ORDER_FULL = graphql(`
  query GetOrderFull($id: ID!) {
    order(id: $id) {
      id
      code
      state
      createdAt
      updatedAt
      orderPlacedAt
      total
      totalWithTax
      currencyCode
      customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
      }
      lines {
        id
        quantity
        linePrice
        linePriceWithTax
        productVariant {
          id
          name
          product {
            id
            name
          }
        }
      }
      payments {
        id
        state
        amount
        method
        createdAt
        metadata
      }
      customFields {
        reversedAt
      }
      fulfillments {
        id
        state
        method
        trackingCode
        createdAt
        updatedAt
      }
      billingAddress {
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        province
        country
        phoneNumber
      }
      shippingAddress {
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        province
        country
        phoneNumber
      }
    }
  }
`);

// ============================================================================
// ML MODEL & TRAINING
// ============================================================================

// REMOVED: GET_ML_MODEL_ASSETS - No longer needed with Asset relationships
// The ML model assets are now fetched directly as part of the channel custom fields

export const GET_ML_TRAINING_INFO = graphql(`
  query GetMlTrainingInfo($channelId: ID!) {
    mlTrainingInfo(channelId: $channelId) {
      status
      progress
      startedAt
      error
      productCount
      imageCount
      hasActiveModel
      lastTrainedAt
    }
  }
`);

export const GET_ML_TRAINING_MANIFEST = graphql(`
  query GetMlTrainingManifest($channelId: ID!) {
    mlTrainingManifest(channelId: $channelId) {
      channelId
      version
      extractedAt
      products {
        productId
        productName
        images {
          assetId
          url
          filename
        }
      }
    }
  }
`);

export const EXTRACT_PHOTOS_FOR_TRAINING = graphql(`
  mutation ExtractPhotosForTraining($channelId: ID!) {
    extractPhotosForTraining(channelId: $channelId)
  }
`);

export const UPDATE_TRAINING_STATUS = graphql(`
  mutation UpdateTrainingStatus($channelId: ID!, $status: String!, $progress: Int, $error: String) {
    updateTrainingStatus(channelId: $channelId, status: $status, progress: $progress, error: $error)
  }
`);

export const START_TRAINING = graphql(`
  mutation StartTraining($channelId: ID!) {
    startTraining(channelId: $channelId)
  }
`);

export const COMPLETE_TRAINING = graphql(`
  mutation CompleteTraining(
    $channelId: ID!
    $modelJson: Upload!
    $weightsFile: Upload!
    $metadata: Upload!
  ) {
    completeTraining(
      channelId: $channelId
      modelJson: $modelJson
      weightsFile: $weightsFile
      metadata: $metadata
    )
  }
`);

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

export const GET_CUSTOMERS = graphql(`
  query GetCustomers($options: CustomerListOptions) {
    customers(options: $options) {
      totalItems
      items {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        createdAt
        updatedAt
        outstandingAmount
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
          lastRepaymentDate
          lastRepaymentAmount
          creditDuration
        }
        addresses {
          id
          fullName
          streetLine1
          streetLine2
          city
          postalCode
          country {
            code
            name
          }
          phoneNumber
        }
        user {
          id
          identifier
          verified
        }
      }
    }
  }
`);

export const GET_COUNTRIES = graphql(`
  query GetCountries($options: CountryListOptions) {
    countries(options: $options) {
      totalItems
      items {
        id
        code
        name
        enabled
      }
    }
  }
`);

export const GET_CUSTOMER = graphql(`
  query GetCustomer($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
      updatedAt
      outstandingAmount
      customFields {
        isSupplier
        supplierType
        contactPerson
        taxId
        paymentTerms
        notes
        isCreditApproved
        creditLimit
        lastRepaymentDate
        lastRepaymentAmount
        creditDuration
      }
      addresses {
        id
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        country {
          code
          name
        }
        phoneNumber
      }
      user {
        id
        identifier
        verified
      }
    }
  }
`);

export const CREATE_CUSTOMER = graphql(`
  mutation CreateCustomer($input: CreateCustomerInput!, $isWalkIn: Boolean) {
    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
      customFields {
        isSupplier
        supplierType
        contactPerson
        taxId
        paymentTerms
        notes
        isCreditApproved
        creditLimit
      }
    }
  }
`);

export const UPDATE_CUSTOMER = graphql(`
  mutation UpdateCustomer($input: UpdateCustomerInput!) {
    updateCustomer(input: $input) {
      ... on Customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        updatedAt
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
        }
      }
      ... on EmailAddressConflictError {
        errorCode
        message
      }
    }
  }
`);

export const DELETE_CUSTOMER = graphql(`
  mutation DeleteCustomer($id: ID!) {
    deleteCustomer(id: $id) {
      result
      message
    }
  }
`);

export const CREATE_CUSTOMER_ADDRESS = graphql(`
  mutation CreateCustomerAddress($customerId: ID!, $input: CreateAddressInput!) {
    createCustomerAddress(customerId: $customerId, input: $input) {
      id
      fullName
      streetLine1
      streetLine2
      city
      postalCode
      country {
        code
        name
      }
      phoneNumber
    }
  }
`);

export const UPDATE_CUSTOMER_ADDRESS = graphql(`
  mutation UpdateCustomerAddress($input: UpdateAddressInput!) {
    updateCustomerAddress(input: $input) {
      id
      fullName
      streetLine1
      streetLine2
      city
      postalCode
      country {
        code
        name
      }
      phoneNumber
    }
  }
`);

export const DELETE_CUSTOMER_ADDRESS = graphql(`
  mutation DeleteCustomerAddress($id: ID!) {
    deleteCustomerAddress(id: $id) {
      success
    }
  }
`);

// ============================================================================
// CREDIT MANAGEMENT
// ============================================================================

export const GET_CREDIT_SUMMARY = graphql(`
  query GetCreditSummary($customerId: ID!) {
    creditSummary(customerId: $customerId) {
      customerId
      isCreditApproved
      creditFrozen
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const VALIDATE_CREDIT = graphql(`
  query ValidateCredit($input: ValidateCreditInput!) {
    validateCredit(input: $input) {
      isValid
      error
      availableCredit
      estimatedOrderTotal
      wouldExceedLimit
    }
  }
`);

export const APPROVE_CUSTOMER_CREDIT = graphql(`
  mutation ApproveCustomerCredit($input: ApproveCustomerCreditInput!) {
    approveCustomerCredit(input: $input) {
      customerId
      isCreditApproved
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const UPDATE_CUSTOMER_CREDIT_LIMIT = graphql(`
  mutation UpdateCustomerCreditLimit($input: UpdateCustomerCreditLimitInput!) {
    updateCustomerCreditLimit(input: $input) {
      customerId
      isCreditApproved
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const UPDATE_CREDIT_DURATION = graphql(`
  mutation UpdateCreditDuration($input: UpdateCreditDurationInput!) {
    updateCreditDuration(input: $input) {
      customerId
      isCreditApproved
      creditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      creditDuration
    }
  }
`);

export const GET_UNPAID_ORDERS_FOR_CUSTOMER = graphql(`
  query GetUnpaidOrdersForCustomer($customerId: ID!) {
    unpaidOrdersForCustomer(customerId: $customerId) {
      id
      code
      state
      total
      totalWithTax
      createdAt
      payments {
        id
        state
        amount
        method
      }
    }
  }
`);

export const ALLOCATE_BULK_PAYMENT = graphql(`
  mutation AllocateBulkPayment($input: PaymentAllocationInput!) {
    allocateBulkPayment(input: $input) {
      ordersPaid {
        orderId
        orderCode
        amountPaid
      }
      remainingBalance
      totalAllocated
    }
  }
`);

export const PAY_SINGLE_ORDER = graphql(`
  mutation PaySingleOrder($input: PaySingleOrderInput!) {
    paySingleOrder(input: $input) {
      ordersPaid {
        orderId
        orderCode
        amountPaid
      }
      remainingBalance
      totalAllocated
    }
  }
`);

export const PAY_SINGLE_PURCHASE = graphql(`
  mutation PaySinglePurchase($input: PaySinglePurchaseInput!) {
    paySinglePurchase(input: $input) {
      purchasesPaid {
        purchaseId
        purchaseReference
        amountPaid
      }
      remainingBalance
      totalAllocated
      excessPayment
    }
  }
`);

export const GET_SUPPLIER_CREDIT_SUMMARY = graphql(`
  query GetSupplierCreditSummary($supplierId: ID!) {
    supplierCreditSummary(supplierId: $supplierId) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const APPROVE_SUPPLIER_CREDIT = graphql(`
  mutation ApproveSupplierCredit($input: ApproveSupplierCreditInput!) {
    approveSupplierCredit(input: $input) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const UPDATE_SUPPLIER_CREDIT_LIMIT = graphql(`
  mutation UpdateSupplierCreditLimit($input: UpdateSupplierCreditLimitInput!) {
    updateSupplierCreditLimit(input: $input) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const UPDATE_SUPPLIER_CREDIT_DURATION = graphql(`
  mutation UpdateSupplierCreditDuration($input: UpdateSupplierCreditDurationInput!) {
    updateSupplierCreditDuration(input: $input) {
      supplierId
      isSupplierCreditApproved
      supplierCreditLimit
      outstandingAmount
      availableCredit
      lastRepaymentDate
      lastRepaymentAmount
      supplierCreditDuration
    }
  }
`);

export const ALLOCATE_BULK_SUPPLIER_PAYMENT = graphql(`
  mutation AllocateBulkSupplierPayment($input: SupplierPaymentAllocationInput!) {
    allocateBulkSupplierPayment(input: $input) {
      purchasesPaid {
        purchaseId
        purchaseReference
        amountPaid
      }
      remainingBalance
      totalAllocated
      excessPayment
    }
  }
`);

// ============================================================================
// PRICE OVERRIDE OPERATIONS
// ============================================================================

export const SET_ORDER_LINE_CUSTOM_PRICE = graphql(`
  mutation SetOrderLineCustomPrice($input: SetOrderLineCustomPriceInput!) {
    setOrderLineCustomPrice(input: $input) {
      ... on OrderLine {
        id
        quantity
        linePrice
        linePriceWithTax
        customFields {
          customLinePrice
          priceOverrideReason
        }
        productVariant {
          id
          name
          price
        }
      }
      ... on Error {
        errorCode
        message
      }
    }
  }
`);

// ============================================================================
// SUPPLIER MANAGEMENT (Custom Fields)
// ============================================================================

export const GET_SUPPLIERS = graphql(`
  query GetSuppliers($options: CustomerListOptions) {
    customers(options: $options) {
      totalItems
      items {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        createdAt
        updatedAt
        supplierOutstandingAmount
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
          creditDuration
          isSupplierCreditApproved
          supplierCreditLimit
        }
        addresses {
          id
          fullName
          streetLine1
          streetLine2
          city
          postalCode
          country {
            code
            name
          }
          phoneNumber
        }
      }
    }
  }
`);

export const GET_SUPPLIER = graphql(`
  query GetSupplier($id: ID!) {
    customer(id: $id) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
      updatedAt
      customFields {
        isSupplier
        supplierType
        contactPerson
        taxId
        paymentTerms
        notes
        isCreditApproved
        creditLimit
        lastRepaymentDate
        lastRepaymentAmount
        creditDuration
      }
      addresses {
        id
        fullName
        streetLine1
        streetLine2
        city
        postalCode
        country {
          code
          name
        }
        phoneNumber
      }
    }
  }
`);

export const CREATE_SUPPLIER = graphql(`
  mutation CreateSupplier($input: CreateCustomerInput!, $isWalkIn: Boolean) {
    createCustomerSafe(input: $input, isWalkIn: $isWalkIn) {
      id
      firstName
      lastName
      emailAddress
      phoneNumber
      createdAt
      customFields {
        isSupplier
        supplierType
        contactPerson
        taxId
        paymentTerms
        notes
        isCreditApproved
        creditLimit
        creditDuration
      }
    }
  }
`);

export const UPDATE_SUPPLIER = graphql(`
  mutation UpdateSupplier($input: UpdateCustomerInput!) {
    updateCustomer(input: $input) {
      ... on Customer {
        id
        firstName
        lastName
        emailAddress
        phoneNumber
        updatedAt
        customFields {
          isSupplier
          supplierType
          contactPerson
          taxId
          paymentTerms
          notes
          isCreditApproved
          creditLimit
          creditDuration
        }
      }
      ... on EmailAddressConflictError {
        errorCode
        message
      }
    }
  }
`);

export const DELETE_SUPPLIER = graphql(`
  mutation DeleteSupplier($id: ID!) {
    deleteCustomer(id: $id) {
      result
      message
    }
  }
`);

export const UPDATE_CHANNEL_LOGO = graphql(`
  mutation UpdateChannelLogo($logoAssetId: ID) {
    updateChannelLogo(logoAssetId: $logoAssetId) {
      cashierFlowEnabled
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`);

export const UPDATE_CASHIER_SETTINGS = graphql(`
  mutation UpdateCashierSettings($cashierFlowEnabled: Boolean) {
    updateCashierSettings(cashierFlowEnabled: $cashierFlowEnabled) {
      cashierFlowEnabled
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`);

export const UPDATE_PRINTER_SETTINGS = graphql(`
  mutation UpdatePrinterSettings($enablePrinter: Boolean!) {
    updatePrinterSettings(enablePrinter: $enablePrinter) {
      cashierFlowEnabled
      enablePrinter
      companyLogoAsset {
        id
        preview
        source
      }
    }
  }
`);

export const INVITE_CHANNEL_ADMINISTRATOR = graphql(`
  mutation InviteChannelAdministrator($input: InviteAdministratorInput!) {
    inviteChannelAdministrator(input: $input) {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
    }
  }
`);

export const GET_ROLE_TEMPLATES = graphql(`
  query GetRoleTemplates {
    roleTemplates {
      code
      name
      description
      permissions
    }
  }
`);

export const CREATE_CHANNEL_ADMIN = graphql(`
  mutation CreateChannelAdmin($input: CreateChannelAdminInput!) {
    createChannelAdmin(input: $input) {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
    }
  }
`);

export const UPDATE_CHANNEL_ADMIN = graphql(`
  mutation UpdateChannelAdmin($id: ID!, $permissions: [String!]!) {
    updateChannelAdmin(id: $id, permissions: $permissions) {
      id
      firstName
      lastName
      emailAddress
      user {
        id
        identifier
        roles {
          id
          code
          permissions
        }
      }
    }
  }
`);

export const DISABLE_CHANNEL_ADMIN = graphql(`
  mutation DisableChannelAdmin($id: ID!) {
    disableChannelAdmin(id: $id) {
      success
      message
    }
  }
`);

export const GET_ADMINISTRATORS = graphql(`
  query GetAdministrators($options: AdministratorListOptions) {
    administrators(options: $options) {
      items {
        id
        firstName
        lastName
        emailAddress
        user {
          id
          identifier
          verified
          roles {
            id
            code
            permissions
            channels {
              id
            }
          }
        }
      }
    }
  }
`);

export const GET_ADMINISTRATOR_BY_ID = graphql(`
  query GetAdministratorById($id: ID!) {
    administrator(id: $id) {
      id
      firstName
      lastName
      emailAddress
      createdAt
      updatedAt
      user {
        id
        identifier
        verified
        lastLogin
        roles {
          id
          code
          description
          permissions
          channels {
            id
            code
            token
          }
        }
      }
    }
  }
`);

export const GET_ADMINISTRATOR_BY_USER_ID = graphql(`
  query GetAdministratorByUserId($userId: ID!) {
    administratorByUserId(userId: $userId) {
      id
      firstName
      lastName
      emailAddress
      createdAt
      updatedAt
      user {
        id
        identifier
        verified
        lastLogin
        roles {
          id
          code
          description
          permissions
          channels {
            id
            code
            token
          }
        }
      }
    }
  }
`);

export const CREATE_CHANNEL_PAYMENT_METHOD = graphql(`
  mutation CreateChannelPaymentMethod($input: CreatePaymentMethodInput!) {
    createChannelPaymentMethod(input: $input) {
      id
      code
      name
    }
  }
`);

export const UPDATE_CHANNEL_PAYMENT_METHOD = graphql(`
  mutation UpdateChannelPaymentMethod($input: UpdatePaymentMethodInput!) {
    updateChannelPaymentMethod(input: $input) {
      id
      code
      name
      customFields {
        imageAsset {
          id
          preview
        }
        isActive
      }
    }
  }
`);

export const GET_AUDIT_LOGS = graphql(`
  query GetAuditLogs($options: AuditLogOptions) {
    auditLogs(options: $options) {
      id
      timestamp
      channelId
      eventType
      entityType
      entityId
      userId
      data
      source
    }
  }
`);

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const GET_USER_NOTIFICATIONS = graphql(`
  query GetUserNotifications($options: NotificationListOptions) {
    getUserNotifications(options: $options) {
      items {
        id
        userId
        channelId
        type
        title
        message
        data
        read
        createdAt
      }
      totalItems
    }
  }
`);

export const GET_UNREAD_COUNT = graphql(`
  query GetUnreadCount {
    getUnreadCount
  }
`);

export const MARK_NOTIFICATION_AS_READ = graphql(`
  mutation MarkNotificationAsRead($id: ID!) {
    markNotificationAsRead(id: $id)
  }
`);

export const MARK_ALL_AS_READ = graphql(`
  mutation MarkAllAsRead {
    markAllAsRead
  }
`);

export const SUBSCRIBE_TO_PUSH = graphql(`
  mutation SubscribeToPush($subscription: PushSubscriptionInput!) {
    subscribeToPush(subscription: $subscription)
  }
`);

export const UNSUBSCRIBE_TO_PUSH = graphql(`
  mutation UnsubscribeToPush {
    unsubscribeToPush
  }
`);

// ============================================================================
// SUBSCRIPTION & PAYMENT
// ============================================================================

export const GET_SUBSCRIPTION_TIERS = graphql(`
  query GetSubscriptionTiers {
    getSubscriptionTiers {
      id
      code
      name
      description
      priceMonthly
      priceYearly
      features
      isActive
      createdAt
      updatedAt
    }
  }
`);

export const GET_CHANNEL_SUBSCRIPTION = graphql(`
  query GetChannelSubscription($channelId: ID) {
    getChannelSubscription(channelId: $channelId) {
      tier {
        id
        code
        name
        description
        priceMonthly
        priceYearly
        features
      }
      status
      trialEndsAt
      subscriptionStartedAt
      subscriptionExpiresAt
      billingCycle
      lastPaymentDate
      lastPaymentAmount
    }
  }
`);

export const CHECK_SUBSCRIPTION_STATUS = graphql(`
  query CheckSubscriptionStatus($channelId: ID) {
    checkSubscriptionStatus(channelId: $channelId) {
      isValid
      status
      daysRemaining
      expiresAt
      trialEndsAt
      canPerformAction
    }
  }
`);

export const INITIATE_SUBSCRIPTION_PURCHASE = graphql(`
  mutation InitiateSubscriptionPurchase(
    $channelId: ID!
    $tierId: String!
    $billingCycle: String!
    $phoneNumber: String!
    $email: String!
    $paymentMethod: String
  ) {
    initiateSubscriptionPurchase(
      channelId: $channelId
      tierId: $tierId
      billingCycle: $billingCycle
      phoneNumber: $phoneNumber
      email: $email
      paymentMethod: $paymentMethod
    ) {
      success
      reference
      authorizationUrl
      message
    }
  }
`);

export const VERIFY_SUBSCRIPTION_PAYMENT = graphql(`
  mutation VerifySubscriptionPayment($channelId: ID!, $reference: String!) {
    verifySubscriptionPayment(channelId: $channelId, reference: $reference)
  }
`);

export const CANCEL_SUBSCRIPTION = graphql(`
  mutation CancelSubscription($channelId: ID!) {
    cancelSubscription(channelId: $channelId)
  }
`);

// ============================================================================
// STOCK MANAGEMENT
// ============================================================================

export const RECORD_PURCHASE = graphql(`
  mutation RecordPurchase($input: RecordPurchaseInput!) {
    recordPurchase(input: $input) {
      id
      supplierId
      purchaseDate
      referenceNumber
      totalCost
      paymentStatus
      notes
      lines {
        id
        variantId
        quantity
        unitCost
        totalCost
        stockLocationId
      }
      createdAt
      updatedAt
    }
  }
`);

export const GET_PURCHASES = graphql(`
  query GetPurchases($options: PurchaseListOptions) {
    purchases(options: $options) {
      items {
        id
        supplierId
        status
        supplier {
          id
          firstName
          lastName
          emailAddress
        }
        purchaseDate
        referenceNumber
        totalCost
        paymentStatus
        isCreditPurchase
        notes
        lines {
          id
          variantId
          variant {
            id
            name
            product {
              id
              name
            }
          }
          quantity
          unitCost
          totalCost
          stockLocationId
          stockLocation {
            id
            name
          }
        }
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

export const GET_PURCHASE = graphql(`
  query GetPurchase($id: ID!) {
    purchase(id: $id) {
      id
      supplierId
      status
      supplier {
        id
        firstName
        lastName
        emailAddress
      }
      purchaseDate
      referenceNumber
      totalCost
      paymentStatus
      isCreditPurchase
      notes
      lines {
        id
        variantId
        variant {
          id
          name
          product {
            id
            name
          }
        }
        quantity
        unitCost
        totalCost
        stockLocationId
        stockLocation {
          id
          name
        }
      }
      createdAt
      updatedAt
    }
  }
`);

export const CONFIRM_PURCHASE = graphql(`
  mutation ConfirmPurchase($id: ID!) {
    confirmPurchase(id: $id) {
      id
      supplierId
      status
      referenceNumber
      totalCost
      paymentStatus
      lines {
        id
        variantId
        quantity
        unitCost
        totalCost
      }
    }
  }
`);

export const UPDATE_DRAFT_PURCHASE = graphql(`
  mutation UpdateDraftPurchase($id: ID!, $input: UpdateDraftPurchaseInput!) {
    updateDraftPurchase(id: $id, input: $input) {
      id
      supplierId
      status
      referenceNumber
      totalCost
      notes
      lines {
        id
        variantId
        quantity
        unitCost
        totalCost
      }
    }
  }
`);

export const RECORD_STOCK_ADJUSTMENT = graphql(`
  mutation RecordStockAdjustment($input: RecordStockAdjustmentInput!) {
    recordStockAdjustment(input: $input) {
      id
      reason
      notes
      adjustedByUserId
      lines {
        id
        variantId
        quantityChange
        previousStock
        newStock
        stockLocationId
      }
      createdAt
      updatedAt
    }
  }
`);

export const GET_STOCK_ADJUSTMENTS = graphql(`
  query GetStockAdjustments($options: StockAdjustmentListOptions) {
    stockAdjustments(options: $options) {
      items {
        id
        reason
        notes
        adjustedByUserId
        lines {
          id
          variantId
          quantityChange
          previousStock
          newStock
          stockLocationId
          variant {
            id
            name
            sku
            product {
              name
            }
          }
          stockLocation {
            id
            name
          }
        }
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

// ============================================================================
// LEDGER & ACCOUNTING
// ============================================================================

export const GET_LEDGER_ACCOUNTS = graphql(`
  query GetLedgerAccounts {
    ledgerAccounts {
      items {
        id
        code
        name
        type
        isActive
        balance
        parentAccountId
        isParent
      }
    }
  }
`);

export const GET_ELIGIBLE_DEBIT_ACCOUNTS = graphql(`
  query GetEligibleDebitAccounts {
    eligibleDebitAccounts {
      items {
        id
        code
        name
        type
        isActive
        balance
        parentAccountId
        isParent
      }
    }
  }
`);

export const RECORD_EXPENSE = graphql(`
  mutation RecordExpense($input: RecordExpenseInput!) {
    recordExpense(input: $input) {
      sourceId
    }
  }
`);

export const CREATE_INTER_ACCOUNT_TRANSFER = graphql(`
  mutation CreateInterAccountTransfer($input: InterAccountTransferInput!) {
    createInterAccountTransfer(input: $input) {
      id
      entryDate
      postedAt
      sourceType
      sourceId
      memo
      lines {
        id
        accountCode
        accountName
        debit
        credit
        meta
      }
    }
  }
`);

export const GET_JOURNAL_ENTRIES = graphql(`
  query GetJournalEntries($options: JournalEntriesOptions) {
    journalEntries(options: $options) {
      items {
        id
        entryDate
        postedAt
        sourceType
        sourceId
        memo
        lines {
          id
          accountCode
          accountName
          debit
          credit
          meta
        }
      }
      totalItems
    }
  }
`);

export const GET_JOURNAL_ENTRY = graphql(`
  query GetJournalEntry($id: ID!) {
    journalEntry(id: $id) {
      id
      entryDate
      postedAt
      sourceType
      sourceId
      memo
      lines {
        id
        accountCode
        accountName
        debit
        credit
        meta
      }
    }
  }
`);

// ============================================================================
// CASHIER SESSION MANAGEMENT
// ============================================================================

export const GET_CHANNEL_RECONCILIATION_CONFIG = graphql(`
  query GetChannelReconciliationConfig($channelId: Int!) {
    channelReconciliationConfig(channelId: $channelId) {
      paymentMethodId
      paymentMethodCode
      reconciliationType
      ledgerAccountCode
      isCashierControlled
      requiresReconciliation
    }
  }
`);

export const GET_SHIFT_MODAL_PREFILL_DATA = graphql(`
  query GetShiftModalPrefillData($channelId: Int!) {
    shiftModalPrefillData(channelId: $channelId) {
      config {
        paymentMethodId
        paymentMethodCode
        reconciliationType
        ledgerAccountCode
        isCashierControlled
        requiresReconciliation
      }
      balances {
        accountCode
        accountName
        balanceCents
      }
    }
  }
`);

export const GET_CURRENT_CASHIER_SESSION = graphql(`
  query GetCurrentCashierSession($channelId: Int!) {
    currentCashierSession(channelId: $channelId) {
      id
      channelId
      cashierUserId
      openedAt
      closedAt
      closingDeclared
      status
    }
  }
`);

export const GET_CASHIER_SESSION = graphql(`
  query GetCashierSession($sessionId: String!) {
    cashierSession(sessionId: $sessionId) {
      sessionId
      cashierUserId
      openedAt
      closedAt
      status
      openingFloat
      closingDeclared
      ledgerTotals {
        cashTotal
        mpesaTotal
        totalCollected
      }
      variance
    }
  }
`);

export const GET_CASHIER_SESSIONS = graphql(`
  query GetCashierSessions($channelId: Int!, $options: CashierSessionListOptions) {
    cashierSessions(channelId: $channelId, options: $options) {
      items {
        id
        channelId
        cashierUserId
        openedAt
        closedAt
        closingDeclared
        status
      }
      totalItems
    }
  }
`);

export const OPEN_CASHIER_SESSION = graphql(`
  mutation OpenCashierSession($input: OpenCashierSessionInput!) {
    openCashierSession(input: $input) {
      id
      channelId
      cashierUserId
      openedAt
      status
    }
  }
`);

export const CLOSE_CASHIER_SESSION = graphql(`
  mutation CloseCashierSession($input: CloseCashierSessionInput!) {
    closeCashierSession(input: $input) {
      sessionId
      cashierUserId
      openedAt
      closedAt
      status
      openingFloat
      closingDeclared
      ledgerTotals {
        cashTotal
        mpesaTotal
        totalCollected
      }
      variance
    }
  }
`);

export const CREATE_CASHIER_SESSION_RECONCILIATION = graphql(`
  mutation CreateCashierSessionReconciliation($sessionId: String!, $notes: String) {
    createCashierSessionReconciliation(sessionId: $sessionId, notes: $notes) {
      id
      channelId
      scope
      scopeRefId
      snapshotAt
      status
      expectedBalance
      actualBalance
      varianceAmount
      notes
      createdBy
    }
  }
`);

export const CREATE_RECONCILIATION = graphql(`
  mutation CreateReconciliation($input: CreateReconciliationInput!) {
    createReconciliation(input: $input) {
      id
      channelId
      scope
      scopeRefId
      snapshotAt
      status
      expectedBalance
      actualBalance
      varianceAmount
      notes
      createdBy
    }
  }
`);

export const GET_RECONCILIATIONS = graphql(`
  query GetReconciliations($channelId: Int!, $options: ReconciliationListOptions) {
    reconciliations(channelId: $channelId, options: $options) {
      items {
        id
        channelId
        scope
        scopeRefId
        snapshotAt
        status
        expectedBalance
        actualBalance
        varianceAmount
        notes
        createdBy
      }
      totalItems
    }
  }
`);

export const GET_RECONCILIATION_DETAILS = graphql(`
  query GetReconciliationDetails($reconciliationId: String!) {
    reconciliationDetails(reconciliationId: $reconciliationId) {
      accountId
      accountCode
      accountName
      declaredAmountCents
      expectedBalanceCents
      varianceCents
    }
  }
`);

export const GET_SESSION_RECONCILIATION_DETAILS = graphql(`
  query GetSessionReconciliationDetails($sessionId: String!, $kind: String, $channelId: Int) {
    sessionReconciliationDetails(sessionId: $sessionId, kind: $kind, channelId: $channelId) {
      accountId
      accountCode
      accountName
      declaredAmountCents
      expectedBalanceCents
      varianceCents
    }
  }
`);

export const GET_ACCOUNT_BALANCES_AS_OF = graphql(`
  query GetAccountBalancesAsOf($channelId: Int!, $asOfDate: String!) {
    accountBalancesAsOf(channelId: $channelId, asOfDate: $asOfDate) {
      accountId
      accountCode
      accountName
      balanceCents
    }
  }
`);

export const GET_LAST_CLOSED_SESSION_CLOSING_BALANCES = graphql(`
  query GetLastClosedSessionClosingBalances($channelId: Int!) {
    lastClosedSessionClosingBalances(channelId: $channelId) {
      accountCode
      accountName
      balanceCents
    }
  }
`);

export const GET_EXPECTED_SESSION_CLOSING_BALANCES = graphql(`
  query GetExpectedSessionClosingBalances($sessionId: String!) {
    expectedSessionClosingBalances(sessionId: $sessionId) {
      accountCode
      accountName
      expectedBalanceCents
    }
  }
`);

// ============================================================================
// CASH CONTROL OPERATIONS
// ============================================================================

export const GET_SESSION_CASH_COUNTS = graphql(`
  query GetSessionCashCounts($sessionId: String!) {
    sessionCashCounts(sessionId: $sessionId) {
      id
      channelId
      sessionId
      countType
      takenAt
      declaredCash
      expectedCash
      variance
      varianceReason
      reviewedByUserId
      reviewedAt
      reviewNotes
      countedByUserId
    }
  }
`);

export const GET_PENDING_VARIANCE_REVIEWS = graphql(`
  query GetPendingVarianceReviews($channelId: Int!) {
    pendingVarianceReviews(channelId: $channelId) {
      id
      channelId
      sessionId
      countType
      takenAt
      declaredCash
      expectedCash
      variance
      varianceReason
      reviewedByUserId
      reviewedAt
      countedByUserId
    }
  }
`);

export const GET_SESSION_MPESA_VERIFICATIONS = graphql(`
  query GetSessionMpesaVerifications($sessionId: String!) {
    sessionMpesaVerifications(sessionId: $sessionId) {
      id
      channelId
      sessionId
      verifiedAt
      transactionCount
      allConfirmed
      flaggedTransactionIds
      notes
      verifiedByUserId
    }
  }
`);

export const RECORD_CASH_COUNT = graphql(`
  mutation RecordCashCount($input: RecordCashCountInput!) {
    recordCashCount(input: $input) {
      count {
        id
        sessionId
        countType
        takenAt
        declaredCash
        varianceReason
        countedByUserId
      }
      hasVariance
      varianceHidden
    }
  }
`);

export const EXPLAIN_VARIANCE = graphql(`
  mutation ExplainVariance($countId: String!, $reason: String!) {
    explainVariance(countId: $countId, reason: $reason) {
      id
      varianceReason
    }
  }
`);

export const REVIEW_CASH_COUNT = graphql(`
  mutation ReviewCashCount($countId: String!, $notes: String) {
    reviewCashCount(countId: $countId, notes: $notes) {
      id
      declaredCash
      expectedCash
      variance
      varianceReason
      reviewedByUserId
      reviewedAt
      reviewNotes
    }
  }
`);

export const VERIFY_MPESA_TRANSACTIONS = graphql(`
  mutation VerifyMpesaTransactions($input: VerifyMpesaInput!) {
    verifyMpesaTransactions(input: $input) {
      id
      sessionId
      verifiedAt
      transactionCount
      allConfirmed
      flaggedTransactionIds
      notes
    }
  }
`);

// ============================================================================
// APPROVAL MANAGEMENT
// ============================================================================

export const GET_APPROVAL_REQUESTS = graphql(`
  query GetApprovalRequests($options: ApprovalRequestListOptions) {
    getApprovalRequests(options: $options) {
      items {
        id
        channelId
        type
        status
        dueAt
        requestedById
        reviewedById
        reviewedAt
        message
        rejectionReasonCode
        metadata
        entityType
        entityId
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

export const GET_APPROVAL_REQUEST = graphql(`
  query GetApprovalRequest($id: ID!) {
    getApprovalRequest(id: $id) {
      id
      channelId
      type
      status
      dueAt
      requestedById
      reviewedById
      reviewedAt
      message
      rejectionReasonCode
      metadata
      entityType
      entityId
      createdAt
      updatedAt
    }
  }
`);

export const GET_MY_APPROVAL_REQUESTS = graphql(`
  query GetMyApprovalRequests($options: ApprovalRequestListOptions) {
    getMyApprovalRequests(options: $options) {
      items {
        id
        channelId
        type
        status
        dueAt
        requestedById
        reviewedById
        reviewedAt
        message
        rejectionReasonCode
        metadata
        entityType
        entityId
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`);

export const CREATE_APPROVAL_REQUEST = graphql(`
  mutation CreateApprovalRequest($input: CreateApprovalRequestInput!) {
    createApprovalRequest(input: $input) {
      id
      type
      status
      createdAt
    }
  }
`);

export const REVIEW_APPROVAL_REQUEST = graphql(`
  mutation ReviewApprovalRequest($input: ReviewApprovalRequestInput!) {
    reviewApprovalRequest(input: $input) {
      id
      type
      status
      message
      reviewedAt
    }
  }
`);

// ============================================================================
// ANALYTICS
// ============================================================================

export const GET_ANALYTICS_STATS = graphql(`
  query GetAnalyticsStats($timeRange: AnalyticsTimeRange!, $limit: Int) {
    analyticsStats(timeRange: $timeRange, limit: $limit) {
      topSelling {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        totalRevenue
        totalMargin
        marginPercent
        quantityChangePercent
      }
      highestRevenue {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        totalRevenue
        totalMargin
        marginPercent
      }
      highestMargin {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        totalRevenue
        totalMargin
        marginPercent
      }
      trending {
        productVariantId
        productId
        productName
        variantName
        totalQuantity
        quantityChangePercent
      }
      salesTrend {
        date
        value
      }
      orderVolumeTrend {
        date
        value
      }
      customerGrowthTrend {
        date
        value
      }
      averageProfitMargin
      totalRevenue
      totalOrders
    }
  }
`);

export const REFRESH_ANALYTICS = graphql(`
  mutation RefreshAnalytics {
    refreshAnalytics
  }
`);
