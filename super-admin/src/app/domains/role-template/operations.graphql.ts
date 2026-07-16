import { graphql } from '../../core/graphql/generated';

/**
 * Role template operations for the super-admin app.
 */

export const ROLE_TEMPLATES = graphql(`
  query PlatformRoleTemplates {
    platformRoleTemplates {
      id
      code
      name
      description
      permissions
    }
  }
`);

export const ASSIGNABLE_PERMISSIONS = graphql(`
  query AssignablePermissions {
    assignablePermissions
  }
`);

export const CREATE_ROLE_TEMPLATE = graphql(`
  mutation CreateRoleTemplate($input: CreateRoleTemplateInput!) {
    createRoleTemplate(input: $input) {
      id
      code
      name
      description
      permissions
    }
  }
`);

export const UPDATE_ROLE_TEMPLATE = graphql(`
  mutation UpdateRoleTemplate($id: ID!, $input: UpdateRoleTemplateInput!) {
    updateRoleTemplate(id: $id, input: $input) {
      id
      code
      name
      description
      permissions
    }
  }
`);

export const DELETE_ROLE_TEMPLATE = graphql(`
  mutation DeleteRoleTemplate($id: ID!) {
    deleteRoleTemplate(id: $id)
  }
`);
