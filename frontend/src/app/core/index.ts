// Services
export * from './services/apollo.service';
export * from './services/auth.service';
export * from './services/camera.service';
export * from './services/cart.service';
export * from './services/company.service';
export * from './services/dashboard.service';
export * from './services/ml-model/ml-model.service';
export * from './services/ml-model/model.types';
export * from './services/ml-model/model-error.util';
export * from './services/network.service';
export * from './services/product.service';
export * from './services/stock-location.service';

// Guards
export * from './guards/auth.guard';

// Models - Re-export both custom and generated types
export * from './models/company.model';
export * from './models/user.model';

// GraphQL Operations
export * from './graphql/operations.graphql';

// GraphQL Generated Types
export { graphql } from './graphql/generated';

// Re-export auth-specific types from user.model (includes ActiveAdministrator)
export type {
  ActiveAdministrator,
  Administrator,
  CurrentUser,
  Customer,
  GetActiveAdministratorQuery,
  LoginMutation,
  LoginMutationVariables,
  LogoutMutation,
  UpdateAdministratorMutation,
} from './models/user.model';

// Re-export other generated types directly from GraphQL
export type {
  // Channel related types
  Channel,
  CurrentUserChannel,
  // Common generated types
  ErrorCode,
  ErrorResult,
  GetUserChannelsQuery,
  // Error types
  InvalidCredentialsError,
  NativeAuthStrategyError,
  // Common types
  Node,
  PaginatedList,
  Success,
  // Input types
  UpdateActiveAdministratorInput,
  UpdateCustomerInput,
} from './graphql/generated/graphql';
