# Role Template Sync (Future Implementation)

This document describes how to implement "sync role permissions from template" so we don't start from scratch. **Sync is not implemented yet**; it is out of scope for the initial team-management refactor.

## Goal

When a `RoleTemplate` is updated (e.g. a new permission is added to the template in the DB), existing `Role` entities that **follow** that template (have a row in `role_template_assignment` linking them to the template) should be able to have their `permissions` updated to match the template. Roles that do not follow a template (custom/override roles) are left unchanged.

## Current State

- **RoleTemplate**: Seeded table `role_template` (id, code, name, description, permissions jsonb).
- **RoleTemplateAssignment**: Table `role_template_assignment` (roleId, templateId). If a role has a row here, it "follows" that template; if not, it is a custom role.
- **Role**: Vendure core entity; `permissions` is the list of permission strings. Updated via `RoleService.update()` or repository.

## Sync Semantics

- **In scope**: Roles that have `role_template_assignment.templateId = T` for some template T. For each such role, set `role.permissions` to the current `RoleTemplate.permissions` for T.
- **Out of scope**: Roles with no row in `role_template_assignment` (custom roles). Do not change their permissions.
- **Idempotent**: Running sync for a template multiple times with the same template data should leave roles unchanged after the first run.

## Implementation Options

### Option A: Migration / one-off script

- Load all templates from `role_template`.
- For each template, find all roles linked via `role_template_assignment` (where templateId = template.id).
- For each such role, set `permissions = template.permissions` and save (via RoleService.update or repository).
- Run manually or as a migration when deploying a template change.

### Option B: Admin API mutation

- Add a mutation e.g. `syncChannelRolesToTemplates(channelId: ID)` or `syncRoleTemplate(templateId: ID)`.
- Resolve template by id; load all roles in `role_template_assignment` for that template (and optionally filter by channel via role.channels).
- Update each role's permissions to template.permissions.
- Gate by `UpdateSettings` (or a dedicated permission if you add one later).

### Option C: Event-driven

- On `RoleTemplate` update (if you add an update API), emit an event; a subscriber finds all roles linked to that template and updates their permissions. More moving parts; only worth it if template edits are frequent.

## Recommended Starting Point

- Prefer **Option B** (mutation) for clarity and auditability: an admin explicitly runs "Sync roles to template" for a template or channel.
- Reuse `RoleTemplateService`: add `getRolesByTemplateId(ctx, templateId)` that returns Role[] from role_template_assignment + role, then in the resolver call `RoleService.update(ctx, roleId, { permissions: template.permissions })` for each.
- Log or audit each updated role so support can see when sync was run and what changed.

## Data to Touch

- **Read**: `role_template` (by id or code), `role_template_assignment` (by templateId), `role` (by id).
- **Write**: `role.permissions` only. Do not create/delete `role_template_assignment` rows during sync.

## Edge Cases

- **Template deleted**: If a template is ever soft-deleted or removed, decide whether to unlink roles (delete from role_template_assignment) or leave them with last-synced permissions. Recommendation: leave assignment in place and do not sync; optionally add a "template archived" flag later.
- **Channel scope**: Sync can be global (all roles for the template) or per-channel (only roles that have the channel in role.channels). Per-channel is safer if templates are shared and you only want to sync one channel's roles.

## Out of Scope Here

- Automatic sync on template save (no update API for RoleTemplate in initial scope).
- Syncing custom roles or merging overrides with template (custom roles stay manual).
