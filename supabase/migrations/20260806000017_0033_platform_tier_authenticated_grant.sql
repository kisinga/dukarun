-- Platform administrators call this RPC with the authenticated browser role.
-- Authorization remains enforced inside the security-definer function by
-- assert_platform_admin(); ordinary authenticated users must be able to enter
-- the function so that check, but cannot pass it.
revoke execute on function public.platform_upsert_tier(
  text, text, bigint, bigint, boolean, boolean, boolean,
  integer, integer, integer, integer, integer, uuid, boolean
) from anon, public;

grant execute on function public.platform_upsert_tier(
  text, text, bigint, bigint, boolean, boolean, boolean,
  integer, integer, integer, integer, integer, uuid, boolean
) to authenticated, service_role;
