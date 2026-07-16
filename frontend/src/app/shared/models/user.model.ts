/**
 * Re-export generated types from GraphQL schema
 * These are the source of truth from the Vendure API
 */
export type {
  Administrator,
  CurrentUser,
  Customer,
  GetActiveAdministratorQuery,
  LoginMutation,
  LoginMutationVariables,
  LogoutMutation,
  UpdateAdministratorMutation,
} from '../graphql/generated/graphql';

// Import for use in type definition
import type { GetActiveAdministratorQuery } from '../graphql/generated/graphql';

/**
 * Type alias for the active administrator data from the query
 * This is what we get from activeAdministrator query
 */
export type ActiveAdministrator = NonNullable<GetActiveAdministratorQuery['activeAdministrator']>;

/**
 * Authentication state for the application
 */
export interface AuthState {
  user: ActiveAdministrator | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
