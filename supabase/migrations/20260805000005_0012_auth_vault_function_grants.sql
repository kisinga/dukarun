-- 0012_auth_vault_function_grants.sql
-- 0011 granted vault schema usage + decrypted_secrets select, but the view
-- decrypts via vault.* functions — supabase_auth_admin also needs EXECUTE
-- there, or the send_sms hook fails with "permission denied for function
-- _crypto_aead_det_decrypt". Verified end-to-end: OTP delivered via TextSMS.
grant execute on all functions in schema vault to supabase_auth_admin;
