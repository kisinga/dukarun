-- 0011_auth_vault_grants.sql
-- The send_sms hook runs as supabase_auth_admin (security invoker) and reads
-- vault.decrypted_secrets for the TextSMS keys. Without these grants GoTrue's
-- OTP flow fails with "permission denied for schema vault". Test numbers
-- bypass the hook, which is why local dev never exercised this.
grant usage on schema vault to supabase_auth_admin;
grant select on vault.decrypted_secrets to supabase_auth_admin;
