-- Keep every active OpenWA caller on the gateway's engine-neutral REST
-- identity contract. Historical migrations remain immutable.
create or replace function public.send_sms_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := event #>> '{user,phone}';
  v_otp text := event #>> '{sms,otp}';
  v_mobile text;
  v_sms_key text;
  v_partner text;
  v_shortcode text;
  v_wa_url text;
  v_wa_key text;
  v_wa_session text;
  v_sms_request bigint;
  v_wa_request bigint;
begin
  select
    max(case when name = 'TEXTSMS_API_KEY' then decrypted_secret end),
    max(case when name = 'TEXTSMS_PARTNER_ID' then decrypted_secret end),
    max(case when name = 'TEXTSMS_SHORTCODE' then decrypted_secret end),
    max(case when name = 'OPENWA_BASE_URL' then decrypted_secret end),
    max(case when name = 'OPENWA_API_KEY' then decrypted_secret end),
    max(case when name = 'OPENWA_SESSION' then decrypted_secret end)
  into v_sms_key, v_partner, v_shortcode, v_wa_url, v_wa_key, v_wa_session
  from vault.decrypted_secrets
  where name in (
    'TEXTSMS_API_KEY',
    'TEXTSMS_PARTNER_ID',
    'TEXTSMS_SHORTCODE',
    'OPENWA_BASE_URL',
    'OPENWA_API_KEY',
    'OPENWA_SESSION'
  );

  v_mobile := ltrim(v_phone, '+');

  if v_sms_key is not null
     and v_sms_key <> 'dev-disabled'
     and v_partner is not null
     and v_shortcode is not null then
    begin
      select net.http_post(
        url := 'https://sms.textsms.co.ke/api/services/sendotp/',
        body := jsonb_build_object(
          'apikey', v_sms_key,
          'partnerID', v_partner,
          'shortcode', v_shortcode,
          'mobile', v_mobile,
          'message', 'Your Dukarun verification code is: ' || v_otp
        ),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      ) into v_sms_request;
    exception when others then
      v_sms_request := null;
    end;
  end if;

  if v_wa_url is not null and v_wa_key is not null then
    begin
      select net.http_post(
        url := rtrim(v_wa_url, '/') || '/api/sessions/'
          || coalesce(nullif(v_wa_session, ''), 'default') || '/messages/send-text',
        body := jsonb_build_object(
          'chatId', v_mobile || '@c.us',
          'text', 'Your Dukarun verification code is: ' || v_otp || '. Never share this code.'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-API-Key', v_wa_key
        ),
        timeout_milliseconds := 5000
      ) into v_wa_request;
    exception when others then
      v_wa_request := null;
    end;
  end if;

  perform public.record_auth_otp_delivery_request(
    encode(extensions.digest(v_phone, 'sha256'), 'hex'),
    right(v_mobile, 4),
    v_sms_request,
    v_wa_request,
    case when v_sms_request is not null then 'queued' else 'failed' end,
    case when v_wa_request is not null then 'queued' else 'failed' end
  );
  return event;
exception when others then
  return event;
end;
$$;

revoke execute on function public.send_sms_hook(jsonb) from public, anon, authenticated;
grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
