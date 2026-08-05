-- 0014_auth_vault_function_grants.sql
-- 0011 granted vault schema usage + decrypted_secrets select, but the view
-- decrypts via vault.* functions — supabase_auth_admin also needs EXECUTE
-- there, or the send_sms hook fails with "permission denied for function
-- _crypto_aead_det_decrypt".
--
-- Some vault functions are owned by supabase_admin, so a plain GRANT fails
-- when migrations run as postgres. Best-effort here; the authoritative grant
-- (already applied to prod + local) is run as supabase_admin:
--   grant execute on all functions in schema vault to supabase_auth_admin;
do $$
begin
  grant execute on all functions in schema vault to supabase_auth_admin;
exception when insufficient_privilege then
  raise notice 'vault function grant needs supabase_admin; apply manually if OTP hook 500s';
end $$;
