-- 0011_checkpoint_deny_policy.sql
-- Silence lint 0008 (rls_enabled_no_policy) on credit_notification_checkpoints.
-- The table is service-role only: RLS enabled with no policies already denies
-- all client access (fail-closed), and service_role bypasses RLS entirely.
-- This explicit deny policy documents the intent; behaviour is unchanged.

create policy credit_notification_checkpoints_deny_all
on public.credit_notification_checkpoints
for all
to authenticated, anon
using (false)
with check (false);

comment on policy credit_notification_checkpoints_deny_all
on public.credit_notification_checkpoints is
  'Fail-closed by design: service-role-only dedupe store, no client access.';
