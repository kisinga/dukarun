-- The auth hook runs as supabase_auth_admin, which cannot execute pg_net in
-- the hosted stack. Run the already-restricted hook with its owner privileges
-- so Vault reads and asynchronous SMS/WhatsApp submissions are not silently
-- rejected. Execute remains limited to Supabase Auth.
alter function public.send_sms_hook(jsonb) security definer;

revoke execute on function public.send_sms_hook(jsonb) from public, anon, authenticated;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
