-- 0002_auth_hooks.sql
-- custom_access_token hook (company_id + role + platform-admin claims) and
-- send_sms hook (TextSMS via pg_net, async — immune to the 5s HTTP-hook timeout).
--
-- Both hooks are Postgres functions invoked by GoTrue (supabase_auth_admin role).
-- Constraints honoured here (see plan §5.2/§5.3):
--   - token hook runs on EVERY token issue/refresh with a 2s budget -> the
--     membership lookup is a single indexed read, nothing else.
--   - hook failure blocks auth -> the token hook never raises; it returns the
--     event unchanged on any unexpected state.
-- Wired in config.toml ([auth.hook.custom_access_token], [auth.hook.send_sms]).

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- platform_admins: super-admin identities (email/password users).
-- Service-role only; read by the token hook.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security; -- no policies: service role + hook only

-- ---------------------------------------------------------------------------
-- custom_access_token_hook
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_company_id uuid;
  v_role_name text;
  v_is_platform_admin boolean;
begin
  -- Single indexed lookup. A user belongs to at most one company in the
  -- current model; earliest approved membership wins if data says otherwise.
  select m.company_id, r.name
    into v_company_id, v_role_name
  from public.company_memberships m
  left join public.roles r on r.id = m.role_id
  where m.user_id = (event ->> 'user_id')::uuid
    and m.authorization_status = 'approved'
  order by m.created_at asc
  limit 1;

  if v_company_id is not null then
    v_claims := jsonb_set(v_claims, '{company_id}', to_jsonb(v_company_id::text));
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(coalesce(v_role_name, '')));
  end if;

  select exists (
    select 1 from public.platform_admins p
    where p.user_id = (event ->> 'user_id')::uuid
  ) into v_is_platform_admin;

  if v_is_platform_admin then
    v_claims := jsonb_set(v_claims, '{is_platform_admin}', 'true'::jsonb);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- send_sms_hook
-- Payload: event->'user'->>'phone' (E.164), event->'sms'->>'otp'.
-- Delivery is fire-and-forget via pg_net; delivery failures land in
-- net._http_response for monitoring (OTP resend is user-driven).
-- Without configured secrets the hook is a no-op so local dev logins
-- still work (codes visible in the GoTrue logs / test_otp map).
-- ---------------------------------------------------------------------------
create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_phone text := event #>> '{user,phone}';
  v_otp text := event #>> '{sms,otp}';
  v_api_key text;
  v_partner_id text;
  v_shortcode text;
  v_mobile text;
begin
  select max(case when name = 'TEXTSMS_API_KEY' then decrypted_secret end),
         max(case when name = 'TEXTSMS_PARTNER_ID' then decrypted_secret end),
         max(case when name = 'TEXTSMS_SHORTCODE' then decrypted_secret end)
    into v_api_key, v_partner_id, v_shortcode
  from vault.decrypted_secrets
  where name in ('TEXTSMS_API_KEY', 'TEXTSMS_PARTNER_ID', 'TEXTSMS_SHORTCODE');

  if v_api_key is null or v_partner_id is null or v_shortcode is null
     or v_api_key = 'dev-disabled' then
    raise notice 'send_sms_hook: TextSMS secrets not configured; OTP for % not delivered', v_phone;
    return event;
  end if;

  -- GoTrue sends E.164 (+2547...); TextSMS expects 2547... (no plus).
  v_mobile := ltrim(v_phone, '+');

  perform net.http_post(
    url := 'https://sms.textsms.co.ke/api/services/sendotp/',
    body := jsonb_build_object(
      'apikey', v_api_key,
      'partnerID', v_partner_id,
      'shortcode', v_shortcode,
      'mobile', v_mobile,
      'message', 'Your Dukahub verification code is: ' || v_otp
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hook permissions (per Supabase docs): only supabase_auth_admin may execute.
-- The token hook reads tenant tables, which are RLS-protected, so
-- supabase_auth_admin gets its own read policies.
-- ---------------------------------------------------------------------------
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
revoke execute on function public.send_sms_hook(jsonb) from authenticated, anon, public;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

grant select on public.company_memberships to supabase_auth_admin;
grant select on public.roles to supabase_auth_admin;
grant select on public.platform_admins to supabase_auth_admin;

create policy "auth admin reads memberships for token hook"
  on public.company_memberships for select
  to supabase_auth_admin
  using (true);

create policy "auth admin reads roles for token hook"
  on public.roles for select
  to supabase_auth_admin
  using (true);

create policy "auth admin reads platform admins for token hook"
  on public.platform_admins for select
  to supabase_auth_admin
  using (true);
