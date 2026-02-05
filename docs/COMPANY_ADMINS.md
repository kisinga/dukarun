# Company Admins Feature

Channel administrators can manage team members with role-based permissions.

## Permissions

- **View role templates**: `ReadSettings` (unchanged)
- **View administrators list**: `ReadAdministrator` (required by Vendure core `administrators` query)
- **Create / invite / update / disable admin**: `UpdateSettings` (one permission for all team mutations)

Store owner and admin template receive `ReadAdministrator`, `UpdateSettings`, and the above so they can view and manage team. Settings page (and Team tab) is gated by `UpdateSettings` on the frontend.

## Features

- **Role Templates**: 5 seeded templates (Admin, Cashier, Accountant, Salesperson, Stockkeeper) stored in `role_template`; roles reference a template by ID via `role_template_assignment` for find-or-create and future sync. These are **standalone tables** (Vendure’s Role entity is not in `config.customFields`); migrations follow the same idempotent/guard patterns as in [VENDURE_CUSTOM_FIELDS.md](VENDURE_CUSTOM_FIELDS.md)
- **Admin Management**: Create, update, and disable channel administrators
- **Permission Overrides**: Customize permissions per admin (creates a custom role; no template link)
- **Rate Limiting**: Configurable max admin count per channel (default: 5); count is distinct admins; limit enforced for both new and existing-user adds

## Backend

### GraphQL API

- `roleTemplates` - List available role templates (from DB)
- `createChannelAdmin` - Create admin with phone number and role template
- `updateChannelAdmin` - Update admin permissions
- `disableChannelAdmin` - Remove admin
- `inviteChannelAdministrator` - Invite admin (requires phone number, email optional)

### Key Files

- `backend/src/domain/role-template/role-template.entity.ts` - RoleTemplate entity
- `backend/src/domain/role-template/role-template-assignment.entity.ts` - Role–template link
- `backend/src/services/channels/role-template.service.ts` - Template resolution and find-or-create
- `backend/src/services/channels/channel-admin.service.ts` - Admin invite/create and role reuse
- `backend/src/services/auth/provisioning/role-provisioner.service.ts` - Store-owner role (uses admin template from DB)
- `backend/src/plugins/channels/channel-settings.resolver.ts` - GraphQL resolvers
- `backend/src/migrations/9000000000006-CreateRoleTemplateTableAndSeed.ts` - Template table + seed
- `backend/src/migrations/9000000000007-CreateRoleTemplateAssignment.ts` - Role–template assignment table

## Frontend

### Team Page

Route: `/dashboard/team`

- View team members with stats
- Search and filter
- Create new admins via multi-step modal
- Edit permissions
- Delete admins

### Key Files

- `frontend/src/app/core/services/team.service.ts` - Team management service
- `frontend/src/app/dashboard/pages/team/` - Team page components
- `frontend/src/app/core/graphql/operations.graphql.ts` - GraphQL operations

## Role Templates

| Role        | Description          | Key Permissions                             |
| ----------- | -------------------- | ------------------------------------------- |
| Admin       | Full system access   | All permissions                             |
| Cashier     | Payment processing   | UpdateOrder, ApproveCustomerCredit          |
| Accountant  | Financial oversight  | ManageReconciliation, CloseAccountingPeriod |
| Salesperson | Sales operations     | CreateOrder, CreateCustomer, OverridePrice  |
| Stockkeeper | Inventory management | CreateProduct, ManageStockAdjustments       |

## Configuration

Channel custom field: `maxAdminCount` (default: 5)

## Notes

- Phone number is required for all admin creation
- When no permission overrides: one role per (channel, template) is reused across admins; when overrides are used, a new custom role is created (no template link)
- Store owner at signup gets the seeded "admin" template role and that role is reused when adding another admin with template "admin"
- Admin deletion removes entity and associated roles
- Template sync (updating existing role permissions from a changed template) is not yet implemented; see `docs/ROLE_TEMPLATE_SYNC.md` for the intended process