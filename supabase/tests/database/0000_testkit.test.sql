-- Test helpers (testkit schema). Runs first; DDL persists for the suite.
-- NOTE: no begin/rollback here on purpose — DDL is transactional in Postgres,
-- so wrapping this file in a transaction and rolling back would drop the
-- schema again. Statements autocommit; the objects survive until db reset.
select plan(1);

create schema if not exists testkit;

-- create_user: id + email (+optional phone, confirmed)
create or replace function testkit.create_user(p_id uuid, p_email text, p_phone text default null)
returns void language sql set search_path = '' as $$
  insert into auth.users (
    id, instance_id, aud, role, email, phone, phone_confirmed_at, encrypted_password,
    confirmation_token, recovery_token, email_change, email_change_token_current,
    email_change_token_new, phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  )
  values (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_phone,
    case when p_phone is not null then now() end, '',
    '', '', '', '', '', '', '', '',
    now(), now()
  )
  on conflict (id) do nothing;
$$;

-- claims: build the JWT-claims JSON the app/hooks read
create or replace function testkit.claims(p_company_id uuid, p_user_id uuid, p_role text)
returns text language sql stable set search_path = '' as $$
  select format('{"sub":"%s","role":"authenticated","company_id":"%s","user_role":"%s"}', p_user_id, p_company_id, p_role)
$$;

-- provision: set claims (txn-local) and run the real provisioning path
create or replace function testkit.provision(p_user_id uuid, p_company_name text)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_company_id uuid;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_user_id), true);
  v_company_id := public.provision_company(p_company_name, 'Main');
  -- Financial fixtures retain strict session behavior unless a test explicitly
  -- disables it. Production registration defaults both choices to off.
  update public.companies
  set cashier_flow_enabled = true,
      cash_control_enabled = true,
      batch_expiry_enabled = true,
      status = 'approved',
      subscription_status = 'active',
      subscription_started_at = coalesce(subscription_started_at, now()),
      subscription_expires_at = now() + interval '1 year',
      billing_cycle = 'yearly'
  where id = v_company_id;
  return v_company_id;
end;
$$;

-- add_member: role + approved membership
create or replace function testkit.add_member(p_company_id uuid, p_user_id uuid, p_role_name text, p_permissions text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_role_id uuid;
begin
  insert into public.roles (company_id, name, permissions)
  values (p_company_id, p_role_name, p_permissions)
  on conflict (company_id, name) do update set permissions = excluded.permissions
  returning id into v_role_id;
  insert into public.company_memberships (company_id, user_id, role_id, authorization_status)
  values (p_company_id, p_user_id, v_role_id, 'approved')
  on conflict (company_id, user_id) do nothing;
  return v_role_id;
end;
$$;

-- as_user: switch role + claims in one call (the most repeated pair).
-- Verified on this stack: SET LOCAL / set_config(..., true) issued inside a
-- plpgsql function persist for the rest of the transaction after return.
create or replace function testkit.as_user(p_company_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql set search_path = '' as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', testkit.claims(p_company_id, p_user_id, p_role), true);
end;
$$;

-- Financial fixtures opt in explicitly: production now requires an open
-- cashier session for completed sales and money-moving operations.
create or replace function testkit.ensure_open_session()
returns uuid language plpgsql set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session_id uuid;
  v_location_id uuid;
  v_declarations jsonb;
begin
  select s.id into v_session_id
  from public.cashier_sessions s
  where s.company_id = v_company_id and s.status = 'open';

  if v_session_id is not null then
    return v_session_id;
  end if;

  select l.id into v_location_id from public.stock_locations l
  where l.company_id=v_company_id and l.is_active
  order by l.is_default desc,l.created_at,l.id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_code',b.account_code,'declared',b.expected_balance
  )),'[]'::jsonb) into v_declarations
  from public.cashier_expected_balances(v_location_id,null) b;

  return public.open_cashier_session_at_location(v_location_id,v_declarations);
end;
$$;

create or replace function testkit.close_open_session()
returns uuid language plpgsql set search_path = '' as $$
declare
  v_company_id uuid := public.current_company_id();
  v_session_id uuid;
  v_location_id uuid;
  v_declarations jsonb;
begin
  select s.id,s.location_id into v_session_id,v_location_id
  from public.cashier_sessions s
  where s.company_id = v_company_id and s.status = 'open';

  if v_session_id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_code',b.account_code,'declared',b.expected_balance
  )),'[]'::jsonb) into v_declarations
  from public.cashier_expected_balances(v_location_id,v_session_id) b;

  return public.close_cashier_session(v_session_id, v_declarations);
end;
$$;

-- Build real protocol-v2 capture evidence for sale regression fixtures. Historical
-- contexts model a server confirmation issued before a delayed capture.
create or replace function testkit.offline_request(p_location uuid,p_customer uuid,p_lines jsonb,
 p_payments jsonb,p_ref text,p_captured timestamptz,p_device text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company uuid:=public.current_company_id();v_session uuid;v_context uuid;v_lines jsonb;
  v_issued timestamptz:=p_captured-interval '1 minute';
begin
 select id into v_session from public.cashier_sessions where company_id=v_company
   and location_id=p_location and status='open';
 if v_session is null then raise exception 'fixture_requires_open_session'; end if;
 select context_id into v_context from public.offline_sale_requests where company_id=v_company and client_ref=p_ref;
 if v_context is null then
   insert into public.offline_sale_contexts(company_id,user_id,location_id,session_id,device_key,issued_at,expires_at)
   values(v_company,auth.uid(),p_location,v_session,p_device,v_issued,v_issued+interval '24 hours') returning id into v_context;
 end if;
 select jsonb_agg(line||jsonb_build_object('capture',state,'units_per_unit',state->'units_per_unit',
   'expected_unit_price',state->'expected_unit_price','unit_price',coalesce(line->'unit_price',state->'expected_unit_price')) order by i) into v_lines
 from jsonb_array_elements(p_lines) with ordinality x(line,i)
 cross join lateral (select public.offline_line_current_state(v_company,line) state) e;
 return jsonb_build_object('protocol_version',2,'location_id',p_location,'customer_id',p_customer,
   'lines',v_lines,'payments',p_payments,'client_ref',p_ref,'occurred_at',p_captured,'device_key',p_device,
   'offline_context_id',v_context,'originating_session_id',v_session);
end;
$$;
create or replace function testkit.post_offline_sale(p_location uuid,p_customer uuid,p_lines jsonb,
 p_payments jsonb,p_ref text,p_captured timestamptz,p_device text,p_pending integer default 1,p_draft uuid default null)
returns jsonb language sql set search_path='' as $$
 select public.submit_offline_sale(testkit.offline_request(p_location,p_customer,p_lines,p_payments,p_ref,p_captured,p_device)
   || jsonb_build_object('draft_id',p_draft))
$$;

-- Helpers may be called while the session role is authenticated.
grant usage on schema testkit to authenticated, anon;
grant execute on all functions in schema testkit to authenticated, anon;

select ok(true, 'testkit ready');
select * from finish();
