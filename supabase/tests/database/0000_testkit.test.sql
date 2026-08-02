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
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_user_id), true);
  return public.provision_company(p_company_name, 'Main');
end;
$$;

-- add_member: role + approved membership
create or replace function testkit.add_member(p_company_id uuid, p_user_id uuid, p_role_name text, p_permissions text[])
returns uuid language plpgsql set search_path = '' as $$
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

-- Helpers may be called while the session role is authenticated.
grant usage on schema testkit to authenticated, anon;
grant execute on all functions in schema testkit to authenticated, anon;

select ok(true, 'testkit ready');
select * from finish();
