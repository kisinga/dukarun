import { graphql } from '../../core/graphql/generated';

/**
 * Auth operations for the super-admin app.
 */

export const AUTHENTICATE = graphql(`
  mutation Authenticate($username: String!, $password: String!) {
    authenticate(input: { native: { username: $username, password: $password } }) {
      ... on CurrentUser {
        id
      }
    }
  }
`);
