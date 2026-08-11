-- First-party blog publishing, engagement metrics, public-site deployment queue,
-- and atomic automatic company approval.

-- ---------------------------------------------------------------------------
-- Registration policy and durable approval provenance.
-- ---------------------------------------------------------------------------
create table public.platform_registration_settings (
  singleton boolean primary key default true check (singleton),
  automatic_company_approval_enabled boolean not null default false,
  hourly_alert_threshold integer not null default 25 check (hourly_alert_threshold between 1 and 100000),
  daily_alert_threshold integer not null default 100 check (daily_alert_threshold between 1 and 1000000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_registration_settings(singleton) values(true);
alter table public.platform_registration_settings enable row level security;
create policy "platform admins read registration settings"
  on public.platform_registration_settings for select to authenticated
  using ((select public.is_platform_admin()));
grant select on public.platform_registration_settings to authenticated;
grant all on public.platform_registration_settings to service_role;
create trigger platform_registration_settings_audit
  after insert or update or delete on public.platform_registration_settings
  for each row execute function public.audit_trigger();

create table public.company_approval_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  approval_mode text not null check (approval_mode in ('manual','automatic','legacy')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now()
);
create index company_approval_events_company_time_idx
  on public.company_approval_events(company_id,approved_at desc);
alter table public.company_approval_events enable row level security;
create policy "platform admins read company approval events"
  on public.company_approval_events for select to authenticated
  using ((select public.is_platform_admin()));
grant select on public.company_approval_events to authenticated;
grant all on public.company_approval_events to service_role;

create table public.platform_registration_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_window text not null check (alert_window in ('hourly','daily')),
  window_started_at timestamptz not null,
  approval_count integer not null check (approval_count>=0),
  threshold integer not null check (threshold>0),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  unique(alert_window,window_started_at)
);
alter table public.platform_registration_alerts enable row level security;
create policy "platform admins read registration alerts"
  on public.platform_registration_alerts for select to authenticated
  using ((select public.is_platform_admin()));
grant select on public.platform_registration_alerts to authenticated;
grant all on public.platform_registration_alerts to service_role;

insert into public.company_approval_events(company_id,approval_mode,approved_at)
select c.id,'legacy',coalesce(c.updated_at,c.created_at)
from public.companies c where c.status='approved'
on conflict do nothing;

create or replace function public.approve_company_transition(p_company_id uuid,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_company public.companies%rowtype;
  v_trial_days integer;
  v_now timestamptz:=now();
begin
  if p_mode not in ('manual','automatic') then raise exception 'invalid_approval_mode'; end if;
  select * into v_company from public.companies where id=p_company_id for update;
  if v_company.id is null then raise exception 'company_not_found: %',p_company_id; end if;
  if v_company.status='approved' then return p_company_id; end if;

  if v_company.subscription_status is null and v_company.trial_started_at is null then
    select trial_duration_days into v_trial_days
    from public.platform_billing_settings where singleton;
    if v_trial_days is null then raise exception 'trial_duration_not_configured'; end if;
    update public.companies set status='approved',subscription_status='trial',
      trial_started_at=v_now,trial_ends_at=v_now+make_interval(days=>v_trial_days),
      subscription_expires_at=v_now+make_interval(days=>v_trial_days),
      subscription_grace_period_end=null,updated_at=v_now where id=p_company_id;
  else
    update public.companies set status='approved',updated_at=v_now where id=p_company_id;
  end if;
  insert into public.company_approval_events(company_id,approval_mode,approved_by,approved_at)
  values(p_company_id,p_mode,case when p_mode='manual' then auth.uid() end,v_now);
  return p_company_id;
end;
$$;
revoke execute on function public.approve_company_transition(uuid,text) from public,anon,authenticated;
grant execute on function public.approve_company_transition(uuid,text) to service_role;

create or replace function public.platform_set_company_status(p_company_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  if p_status not in ('unapproved','approved','disabled','banned') then raise exception 'invalid_status'; end if;
  if p_status='approved' then return public.approve_company_transition(p_company_id,'manual'); end if;
  update public.companies set status=p_status,updated_at=now() where id=p_company_id;
  if not found then raise exception 'company_not_found: %',p_company_id; end if;
  return p_company_id;
end;
$$;

create or replace function public.platform_registration_config()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_settings public.platform_registration_settings%rowtype;v_result jsonb;
begin
  perform public.assert_platform_admin();
  select * into v_settings from public.platform_registration_settings where singleton;
  select jsonb_build_object(
    'automatic_company_approval_enabled',coalesce(v_settings.automatic_company_approval_enabled,false),
    'hourly_alert_threshold',coalesce(v_settings.hourly_alert_threshold,25),
    'daily_alert_threshold',coalesce(v_settings.daily_alert_threshold,100),
    'updated_at',v_settings.updated_at,
    'automatic_last_hour',(select count(*) from public.company_approval_events where approval_mode='automatic' and approved_at>=now()-interval '1 hour'),
    'automatic_last_day',(select count(*) from public.company_approval_events where approval_mode='automatic' and approved_at>=now()-interval '1 day')
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.platform_registration_config() from public,anon;
grant execute on function public.platform_registration_config() to authenticated,service_role;

create or replace function public.platform_update_registration_config(
  p_automatic_company_approval_enabled boolean,p_hourly_alert_threshold integer,p_daily_alert_threshold integer
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  if p_hourly_alert_threshold not between 1 and 100000
     or p_daily_alert_threshold not between 1 and 1000000 then raise exception 'invalid_registration_threshold'; end if;
  insert into public.platform_registration_settings(singleton,automatic_company_approval_enabled,
    hourly_alert_threshold,daily_alert_threshold,updated_by,updated_at)
  values(true,p_automatic_company_approval_enabled,p_hourly_alert_threshold,p_daily_alert_threshold,auth.uid(),now())
  on conflict(singleton) do update set
    automatic_company_approval_enabled=excluded.automatic_company_approval_enabled,
    hourly_alert_threshold=excluded.hourly_alert_threshold,
    daily_alert_threshold=excluded.daily_alert_threshold,updated_by=auth.uid(),updated_at=now();
  return public.platform_registration_config();
end;
$$;
revoke execute on function public.platform_update_registration_config(boolean,integer,integer) from public,anon;
grant execute on function public.platform_update_registration_config(boolean,integer,integer) to authenticated,service_role;

create or replace function public.scan_registration_volume_alerts()
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_settings public.platform_registration_settings%rowtype;
  v_hour_start timestamptz:=date_trunc('hour',now());
  v_day_start timestamptz:=(date_trunc('day',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi');
  v_hour_count integer;
  v_day_count integer;
  v_inserted integer:=0;
begin
  select * into v_settings from public.platform_registration_settings where singleton;
  if not coalesce(v_settings.automatic_company_approval_enabled,false) then return 0; end if;
  select count(*) into v_hour_count from public.company_approval_events
    where approval_mode='automatic' and approved_at>=v_hour_start;
  select count(*) into v_day_count from public.company_approval_events
    where approval_mode='automatic' and approved_at>=v_day_start;
  if v_hour_count>=v_settings.hourly_alert_threshold then
    insert into public.platform_registration_alerts(alert_window,window_started_at,approval_count,threshold)
    values('hourly',v_hour_start,v_hour_count,v_settings.hourly_alert_threshold)
    on conflict(alert_window,window_started_at) do update set
      approval_count=excluded.approval_count,threshold=excluded.threshold;
    v_inserted:=v_inserted+1;
  end if;
  if v_day_count>=v_settings.daily_alert_threshold then
    insert into public.platform_registration_alerts(alert_window,window_started_at,approval_count,threshold)
    values('daily',v_day_start,v_day_count,v_settings.daily_alert_threshold)
    on conflict(alert_window,window_started_at) do update set
      approval_count=excluded.approval_count,threshold=excluded.threshold;
    v_inserted:=v_inserted+1;
  end if;
  return v_inserted;
end;
$$;
revoke execute on function public.scan_registration_volume_alerts() from public,anon,authenticated;
grant execute on function public.scan_registration_volume_alerts() to service_role;

create or replace function public.platform_registration_alerts(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_result
  from(select * from public.platform_registration_alerts order by created_at desc
    limit least(greatest(p_limit,1),100)) a;
  return v_result;
end;
$$;
revoke execute on function public.platform_registration_alerts(integer) from public,anon;
grant execute on function public.platform_registration_alerts(integer) to authenticated,service_role;

create or replace function public.platform_acknowledge_registration_alert(p_alert_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.platform_registration_alerts set acknowledged_at=coalesce(acknowledged_at,now()),
    acknowledged_by=coalesce(acknowledged_by,auth.uid()) where id=p_alert_id;
  return found;
end;
$$;
revoke execute on function public.platform_acknowledge_registration_alert(uuid) from public,anon;
grant execute on function public.platform_acknowledge_registration_alert(uuid) to authenticated,service_role;
select cron.schedule('registration-volume-alerts','*/5 * * * *',$$select public.scan_registration_volume_alerts()$$);

-- ---------------------------------------------------------------------------
-- Blog content, revisions, media, and public projections.
-- ---------------------------------------------------------------------------
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug)<=100),
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blog_post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  version_number integer not null check(version_number>0),
  publication_state text not null default 'draft'
    check(publication_state in ('draft','scheduled','published','superseded')),
  title text not null check(char_length(title) between 1 and 120),
  excerpt text not null check(char_length(excerpt) between 1 and 320),
  content_markdown text not null check(char_length(content_markdown) between 1 and 100000),
  author_name text not null check(char_length(author_name) between 1 and 120),
  cover_image_path text,
  cover_image_alt text check(cover_image_alt is null or char_length(cover_image_alt)<=200),
  tags text[] not null default '{}',
  seo_title text check(seo_title is null or char_length(seo_title)<=70),
  seo_description text check(seo_description is null or char_length(seo_description)<=180),
  scheduled_for timestamptz,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id,version_number),
  check(cardinality(tags)<=10),
  check((publication_state='scheduled')=(scheduled_for is not null))
);
create unique index blog_post_one_draft_idx on public.blog_post_versions(post_id)
  where publication_state='draft';
create unique index blog_post_one_scheduled_idx on public.blog_post_versions(post_id)
  where publication_state='scheduled';
create unique index blog_post_one_published_idx on public.blog_post_versions(post_id)
  where publication_state='published';
create index blog_post_versions_public_idx on public.blog_post_versions(published_at desc)
  where publication_state='published';

alter table public.blog_posts enable row level security;
alter table public.blog_post_versions enable row level security;
grant all on public.blog_posts,public.blog_post_versions to service_role;
create trigger blog_posts_audit after insert or update or delete on public.blog_posts
  for each row execute function public.audit_trigger();
create trigger blog_post_versions_audit after insert or update or delete on public.blog_post_versions
  for each row execute function public.audit_trigger();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('blog-media','blog-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
create policy "public blog media readable" on storage.objects for select
  using(bucket_id='blog-media');
create policy "platform admins insert blog media" on storage.objects for insert to authenticated
  with check(bucket_id='blog-media' and (select public.is_platform_admin()));
create policy "platform admins update blog media" on storage.objects for update to authenticated
  using(bucket_id='blog-media' and (select public.is_platform_admin()))
  with check(bucket_id='blog-media' and (select public.is_platform_admin()));
create policy "platform admins delete blog media" on storage.objects for delete to authenticated
  using(bucket_id='blog-media' and (select public.is_platform_admin()));

create or replace function public.validate_blog_fields(
  p_slug text,p_title text,p_excerpt text,p_content_markdown text,p_author_name text,
  p_cover_image_path text,p_cover_image_alt text,p_tags text[],p_seo_title text,p_seo_description text
) returns void language plpgsql immutable set search_path='' as $$
declare v_tag text;
begin
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug)>100 then raise exception 'invalid_blog_slug'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'invalid_blog_title'; end if;
  if char_length(trim(coalesce(p_excerpt,''))) not between 1 and 320 then raise exception 'invalid_blog_excerpt'; end if;
  if char_length(trim(coalesce(p_content_markdown,''))) not between 1 and 100000 then raise exception 'invalid_blog_content'; end if;
  if p_content_markdown ~ '<[A-Za-z/!][^>]*>' then raise exception 'raw_html_not_allowed'; end if;
  if char_length(trim(coalesce(p_author_name,''))) not between 1 and 120 then raise exception 'invalid_blog_author'; end if;
  if p_cover_image_path is not null and (p_cover_image_path!~'^[0-9a-f-]+/[A-Za-z0-9._-]+$' or char_length(p_cover_image_path)>300) then raise exception 'invalid_blog_cover_path'; end if;
  if p_cover_image_alt is not null and char_length(p_cover_image_alt)>200 then raise exception 'invalid_blog_cover_alt'; end if;
  if cardinality(coalesce(p_tags,'{}'))>10 then raise exception 'too_many_blog_tags'; end if;
  foreach v_tag in array coalesce(p_tags,'{}') loop
    if v_tag!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_tag)>40 then raise exception 'invalid_blog_tag'; end if;
  end loop;
  if p_seo_title is not null and char_length(p_seo_title)>70 then raise exception 'invalid_blog_seo_title'; end if;
  if p_seo_description is not null and char_length(p_seo_description)>180 then raise exception 'invalid_blog_seo_description'; end if;
end;
$$;
revoke execute on function public.validate_blog_fields(text,text,text,text,text,text,text,text[],text,text) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Public-site deployment queue. The Edge Function claims and reconciles rows.
-- ---------------------------------------------------------------------------
create table public.public_site_deployments (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'coolify' check(provider='coolify'),
  provider_deployment_id text unique,
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled','timed_out')),
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index public_site_one_active_deployment_idx
  on public.public_site_deployments((true)) where status in ('queued','running');
create table public.public_site_deploy_requests (
  id uuid primary key default gen_random_uuid(),
  reason text not null check(reason in ('blog_publish','blog_archive','legal_publish','pricing_change','manual')),
  resource_type text not null,
  resource_id uuid,
  revision_id uuid references public.blog_post_versions(id) on delete set null,
  deployment_id uuid references public.public_site_deployments(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','claimed','succeeded','failed')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index public_site_deploy_requests_pending_idx on public.public_site_deploy_requests(created_at)
  where status='pending';
alter table public.public_site_deployments enable row level security;
alter table public.public_site_deploy_requests enable row level security;
create policy "platform admins read site deployments" on public.public_site_deployments for select
  to authenticated using((select public.is_platform_admin()));
create policy "platform admins read site deployment requests" on public.public_site_deploy_requests for select
  to authenticated using((select public.is_platform_admin()));
grant select on public.public_site_deployments,public.public_site_deploy_requests to authenticated;
grant all on public.public_site_deployments,public.public_site_deploy_requests to service_role;

create or replace function public.platform_save_blog_draft(
  p_post_id uuid,p_slug text,p_title text,p_excerpt text,p_content_markdown text,p_author_name text,
  p_cover_image_path text default null,p_cover_image_alt text default null,p_tags text[] default '{}',
  p_seo_title text default null,p_seo_description text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_post public.blog_posts%rowtype;v_version public.blog_post_versions%rowtype;v_number integer;
begin
  perform public.assert_platform_admin();
  perform public.validate_blog_fields(p_slug,p_title,p_excerpt,p_content_markdown,p_author_name,
    p_cover_image_path,p_cover_image_alt,p_tags,p_seo_title,p_seo_description);
  if p_post_id is null then
    insert into public.blog_posts(slug,created_by) values(p_slug,auth.uid()) returning * into v_post;
  else
    select * into v_post from public.blog_posts where id=p_post_id for update;
    if v_post.id is null then raise exception 'blog_post_not_found'; end if;
    if v_post.slug<>p_slug and exists(select 1 from public.blog_post_versions where post_id=v_post.id and publication_state in ('published','superseded')) then
      raise exception 'published_blog_slug_immutable';
    end if;
    update public.blog_posts set slug=p_slug,archived_at=null,updated_at=now() where id=v_post.id returning * into v_post;
  end if;
  select * into v_version from public.blog_post_versions where post_id=v_post.id and publication_state='draft' for update;
  if v_version.id is null then
    select coalesce(max(version_number),0)+1 into v_number from public.blog_post_versions where post_id=v_post.id;
    insert into public.blog_post_versions(post_id,version_number,title,excerpt,content_markdown,author_name,
      cover_image_path,cover_image_alt,tags,seo_title,seo_description,created_by)
    values(v_post.id,v_number,trim(p_title),trim(p_excerpt),p_content_markdown,trim(p_author_name),
      p_cover_image_path,nullif(trim(coalesce(p_cover_image_alt,'')),''),coalesce(p_tags,'{}'),
      nullif(trim(coalesce(p_seo_title,'')),''),nullif(trim(coalesce(p_seo_description,'')),''),auth.uid()) returning * into v_version;
  else
    update public.blog_post_versions set title=trim(p_title),excerpt=trim(p_excerpt),content_markdown=p_content_markdown,
      author_name=trim(p_author_name),cover_image_path=p_cover_image_path,
      cover_image_alt=nullif(trim(coalesce(p_cover_image_alt,'')),''),tags=coalesce(p_tags,'{}'),
      seo_title=nullif(trim(coalesce(p_seo_title,'')),''),seo_description=nullif(trim(coalesce(p_seo_description,'')),''),updated_at=now()
    where id=v_version.id returning * into v_version;
  end if;
  return jsonb_build_object('post_id',v_post.id,'revision_id',v_version.id,'version_number',v_version.version_number,'slug',v_post.slug);
end;
$$;
revoke execute on function public.platform_save_blog_draft(uuid,text,text,text,text,text,text,text,text[],text,text) from public,anon;
grant execute on function public.platform_save_blog_draft(uuid,text,text,text,text,text,text,text,text[],text,text) to authenticated,service_role;

create or replace function public.platform_publish_blog_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_post public.blog_posts%rowtype;v_version public.blog_post_versions%rowtype;v_now timestamptz:=now();
begin
  perform public.assert_platform_admin();
  select * into v_post from public.blog_posts where id=p_post_id for update;
  if v_post.id is null then raise exception 'blog_post_not_found'; end if;
  select * into v_version from public.blog_post_versions where post_id=p_post_id and publication_state='draft' for update;
  if v_version.id is null then raise exception 'blog_draft_not_found'; end if;
  update public.blog_post_versions set publication_state='superseded',updated_at=v_now
    where post_id=p_post_id and publication_state='published';
  update public.blog_post_versions set publication_state='published',published_at=v_now,published_by=auth.uid(),updated_at=v_now
    where id=v_version.id returning * into v_version;
  update public.blog_posts set archived_at=null,updated_at=v_now where id=p_post_id;
  insert into public.public_site_deploy_requests(reason,resource_type,resource_id,revision_id,requested_by)
    values('blog_publish','blog_post',p_post_id,v_version.id,auth.uid());
  return jsonb_build_object('post_id',p_post_id,'revision_id',v_version.id,'published_at',v_now);
end;
$$;
revoke execute on function public.platform_publish_blog_post(uuid) from public,anon;
grant execute on function public.platform_publish_blog_post(uuid) to authenticated,service_role;

create or replace function public.platform_schedule_blog_post(p_post_id uuid,p_scheduled_for timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_version uuid;
begin
  perform public.assert_platform_admin();
  if p_scheduled_for<=now() then return public.platform_publish_blog_post(p_post_id); end if;
  update public.blog_post_versions set publication_state='scheduled',scheduled_for=p_scheduled_for,updated_at=now()
    where post_id=p_post_id and publication_state='draft' returning id into v_version;
  if v_version is null then raise exception 'blog_draft_not_found'; end if;
  return jsonb_build_object('post_id',p_post_id,'revision_id',v_version,'scheduled_for',p_scheduled_for);
end;
$$;
revoke execute on function public.platform_schedule_blog_post(uuid,timestamptz) from public,anon;
grant execute on function public.platform_schedule_blog_post(uuid,timestamptz) to authenticated,service_role;

create or replace function public.platform_cancel_scheduled_blog_post(p_post_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.blog_post_versions set publication_state='draft',scheduled_for=null,updated_at=now()
    where post_id=p_post_id and publication_state='scheduled';
  return found;
end;
$$;
revoke execute on function public.platform_cancel_scheduled_blog_post(uuid) from public,anon;
grant execute on function public.platform_cancel_scheduled_blog_post(uuid) to authenticated,service_role;

create or replace function public.platform_archive_blog_post(p_post_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.blog_posts set archived_at=now(),updated_at=now() where id=p_post_id;
  if not found then raise exception 'blog_post_not_found'; end if;
  update public.blog_post_versions set publication_state='superseded',scheduled_for=null,updated_at=now()
    where post_id=p_post_id and publication_state in ('published','scheduled');
  insert into public.public_site_deploy_requests(reason,resource_type,resource_id,requested_by)
    values('blog_archive','blog_post',p_post_id,auth.uid());
  return true;
end;
$$;
revoke execute on function public.platform_archive_blog_post(uuid) from public,anon;
grant execute on function public.platform_archive_blog_post(uuid) to authenticated,service_role;

create or replace function public.publish_due_blog_posts()
returns integer language plpgsql security definer set search_path='' as $$
declare v_due record;v_count integer:=0;v_now timestamptz:=now();
begin
  for v_due in select v.id,v.post_id from public.blog_post_versions v join public.blog_posts p on p.id=v.post_id
    where v.publication_state='scheduled' and v.scheduled_for<=v_now and p.archived_at is null
    order by v.scheduled_for for update of v skip locked
  loop
    update public.blog_post_versions set publication_state='superseded',updated_at=v_now
      where post_id=v_due.post_id and publication_state='published';
    update public.blog_post_versions set publication_state='published',scheduled_for=null,
      published_at=v_now,published_by=created_by,updated_at=v_now where id=v_due.id;
    update public.blog_posts set updated_at=v_now where id=v_due.post_id;
    insert into public.public_site_deploy_requests(reason,resource_type,resource_id,revision_id)
      values('blog_publish','blog_post',v_due.post_id,v_due.id);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.publish_due_blog_posts() from public,anon,authenticated;
grant execute on function public.publish_due_blog_posts() to service_role;
select cron.schedule('publish-due-blog-posts','* * * * *',$$select public.publish_due_blog_posts()$$);

create or replace function public.platform_blog_posts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'post_id',p.id,'slug',p.slug,'archived_at',p.archived_at,'created_at',p.created_at,'updated_at',p.updated_at,
    'revision_id',v.id,'version_number',v.version_number,'publication_state',case when p.archived_at is not null then 'archived' else coalesce(v.publication_state,'empty') end,
    'title',v.title,'excerpt',v.excerpt,'author_name',v.author_name,
    'cover_image_path',v.cover_image_path,'cover_image_alt',v.cover_image_alt,'tags',v.tags,
    'seo_title',v.seo_title,'seo_description',v.seo_description,'scheduled_for',v.scheduled_for,'published_at',v.published_at
  ) order by p.updated_at desc),'[]'::jsonb) into v_result
  from public.blog_posts p left join lateral(
    select * from public.blog_post_versions x where x.post_id=p.id
    order by case x.publication_state when 'draft' then 1 when 'scheduled' then 2 when 'published' then 3 else 4 end,x.version_number desc limit 1
  ) v on true;
  return v_result;
end;
$$;
revoke execute on function public.platform_blog_posts() from public,anon;
grant execute on function public.platform_blog_posts() to authenticated,service_role;

create or replace function public.platform_blog_post(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object(
    'post_id',p.id,'slug',p.slug,'archived_at',p.archived_at,'created_at',p.created_at,'updated_at',p.updated_at,
    'revision_id',v.id,'version_number',v.version_number,'publication_state',case when p.archived_at is not null then 'archived' else coalesce(v.publication_state,'empty') end,
    'title',v.title,'excerpt',v.excerpt,'content_markdown',v.content_markdown,'author_name',v.author_name,
    'cover_image_path',v.cover_image_path,'cover_image_alt',v.cover_image_alt,'tags',v.tags,
    'seo_title',v.seo_title,'seo_description',v.seo_description,'scheduled_for',v.scheduled_for,'published_at',v.published_at
  ) into v_result from public.blog_posts p left join lateral(
    select * from public.blog_post_versions x where x.post_id=p.id
    order by case x.publication_state when 'draft' then 1 when 'scheduled' then 2 when 'published' then 3 else 4 end,x.version_number desc limit 1
  ) v on true where p.id=p_post_id;
  return v_result;
end;
$$;
revoke execute on function public.platform_blog_post(uuid) from public,anon;
grant execute on function public.platform_blog_post(uuid) to authenticated,service_role;

create or replace function public.public_blog_posts(
  p_limit integer default 12,p_before timestamptz default null,p_before_id uuid default null,p_tag text default null
)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.published_at desc,q.post_id desc),'[]'::jsonb) from(
    select p.id post_id,p.slug,v.title,v.excerpt,v.author_name,v.cover_image_path,v.cover_image_alt,v.tags,
      coalesce(v.seo_title,v.title) seo_title,coalesce(v.seo_description,v.excerpt) seo_description,
      v.published_at,ceil(array_length(regexp_split_to_array(v.content_markdown,'\\s+'),1)/200.0)::int reading_minutes
    from public.blog_posts p join public.blog_post_versions v on v.post_id=p.id and v.publication_state='published'
    where p.archived_at is null and (p_before is null or v.published_at<p_before
      or (v.published_at=p_before and p_before_id is not null and p.id<p_before_id))
      and (p_tag is null or p_tag=any(v.tags))
    order by v.published_at desc,p.id desc limit least(greatest(p_limit,1),50)
  ) q;
$$;
revoke execute on function public.public_blog_posts(integer,timestamptz,uuid,text) from public;
grant execute on function public.public_blog_posts(integer,timestamptz,uuid,text) to anon,authenticated,service_role;

create or replace function public.public_blog_sitemap()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',p.slug,'published_at',v.published_at,'updated_at',v.updated_at
  ) order by v.published_at desc,p.id),'[]'::jsonb)
  from public.blog_posts p join public.blog_post_versions v
    on v.post_id=p.id and v.publication_state='published'
  where p.archived_at is null;
$$;
revoke execute on function public.public_blog_sitemap() from public;
grant execute on function public.public_blog_sitemap() to anon,authenticated,service_role;

create or replace function public.public_blog_post(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('post_id',p.id,'revision_id',v.id,'slug',p.slug,'title',v.title,'excerpt',v.excerpt,
    'content_markdown',v.content_markdown,'author_name',v.author_name,'cover_image_path',v.cover_image_path,
    'cover_image_alt',v.cover_image_alt,'tags',v.tags,'seo_title',coalesce(v.seo_title,v.title),
    'seo_description',coalesce(v.seo_description,v.excerpt),'published_at',v.published_at,
    'updated_at',v.updated_at,'reading_minutes',ceil(array_length(regexp_split_to_array(v.content_markdown,'\\s+'),1)/200.0)::int)
  from public.blog_posts p join public.blog_post_versions v on v.post_id=p.id and v.publication_state='published'
  where p.slug=p_slug and p.archived_at is null limit 1;
$$;
revoke execute on function public.public_blog_post(text) from public;
grant execute on function public.public_blog_post(text) to anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- First-party engagement events and durable registration attribution.
-- ---------------------------------------------------------------------------
create table public.blog_events (
  id uuid primary key,
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  visitor_id uuid not null,
  event_type text not null check(event_type in ('post_view','engaged_10s','scroll_50','scroll_90','cta_click','share_click')),
  event_day date not null,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create unique index blog_events_unique_daily_signal_idx on public.blog_events(post_id,visitor_id,event_type,event_day)
  where event_type in ('post_view','engaged_10s','scroll_50','scroll_90');
create index blog_events_post_time_idx on public.blog_events(post_id,occurred_at desc);
create index blog_events_visitor_time_idx on public.blog_events(visitor_id,occurred_at desc);
create index blog_events_time_idx on public.blog_events(occurred_at desc);
alter table public.blog_events enable row level security;
grant all on public.blog_events to service_role;

create table public.company_registration_attributions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  post_id uuid not null references public.blog_posts(id) on delete restrict,
  click_event_id uuid unique references public.blog_events(id) on delete set null,
  attributed_at timestamptz not null default now()
);
alter table public.company_registration_attributions enable row level security;
create policy "platform admins read registration attribution" on public.company_registration_attributions
  for select to authenticated using((select public.is_platform_admin()));
grant select on public.company_registration_attributions to authenticated;
grant all on public.company_registration_attributions to service_role;

create table public.blog_daily_metrics (
  metric_day date not null,
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  views integer not null default 0,
  unique_readers integer not null default 0,
  engaged_readers integer not null default 0,
  scroll_50 integer not null default 0,
  scroll_90 integer not null default 0,
  cta_clicks integer not null default 0,
  share_clicks integer not null default 0,
  registrations integer not null default 0,
  primary key(metric_day,post_id)
);
alter table public.blog_daily_metrics enable row level security;
create policy "platform admins read blog metrics" on public.blog_daily_metrics for select to authenticated
  using((select public.is_platform_admin()));
grant select on public.blog_daily_metrics to authenticated;
grant all on public.blog_daily_metrics to service_role;

create or replace function public.record_blog_event(
  p_event_id uuid,p_post_id uuid,p_visitor_id uuid,p_event_type text,p_metadata jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_event_type not in ('post_view','engaged_10s','scroll_50','scroll_90','cta_click','share_click') then raise exception 'invalid_blog_event'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'))<>'object' or octet_length(coalesce(p_metadata,'{}')::text)>2048 then raise exception 'invalid_blog_event_metadata'; end if;
  if not exists(select 1 from public.blog_post_versions v join public.blog_posts p on p.id=v.post_id
    where p.id=p_post_id and p.archived_at is null and v.publication_state='published') then return false; end if;
  if (select count(*) from public.blog_events where visitor_id=p_visitor_id and occurred_at>=now()-interval '1 hour')>=100 then return false; end if;
  insert into public.blog_events(id,post_id,visitor_id,event_type,event_day,metadata)
  values(p_event_id,p_post_id,p_visitor_id,p_event_type,(now() at time zone 'UTC')::date,coalesce(p_metadata,'{}'))
  on conflict do nothing;
  return found;
end;
$$;
revoke execute on function public.record_blog_event(uuid,uuid,uuid,text,jsonb) from public;
grant execute on function public.record_blog_event(uuid,uuid,uuid,text,jsonb) to anon,authenticated,service_role;

create or replace function public.refresh_blog_daily_metrics()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  insert into public.blog_daily_metrics(metric_day,post_id,views,unique_readers,engaged_readers,scroll_50,scroll_90,cta_clicks,share_clicks,registrations)
  select e.event_day,e.post_id,count(*) filter(where e.event_type='post_view'),
    count(distinct e.visitor_id) filter(where e.event_type='post_view'),count(distinct e.visitor_id) filter(where e.event_type='engaged_10s'),
    count(*) filter(where e.event_type='scroll_50'),count(*) filter(where e.event_type='scroll_90'),
    count(*) filter(where e.event_type='cta_click'),count(*) filter(where e.event_type='share_click'),
    (select count(*) from public.company_registration_attributions a where a.post_id=e.post_id and (a.attributed_at at time zone 'UTC')::date=e.event_day)
  from public.blog_events e where e.occurred_at>=now()-interval '91 days' group by e.event_day,e.post_id
  on conflict(metric_day,post_id) do update set views=excluded.views,unique_readers=excluded.unique_readers,
    engaged_readers=excluded.engaged_readers,scroll_50=excluded.scroll_50,scroll_90=excluded.scroll_90,
    cta_clicks=excluded.cta_clicks,share_clicks=excluded.share_clicks,registrations=excluded.registrations;
  get diagnostics v_count=row_count;
  delete from public.blog_events where occurred_at<now()-interval '90 days';
  return v_count;
end;
$$;
revoke execute on function public.refresh_blog_daily_metrics() from public,anon,authenticated;
grant execute on function public.refresh_blog_daily_metrics() to service_role;
select cron.schedule('blog-daily-metrics','17 0 * * *',$$select public.refresh_blog_daily_metrics()$$);

create or replace function public.platform_blog_metrics(p_since timestamptz default now()-interval '30 days',p_post_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object(
    'views',count(*) filter(where e.event_type='post_view'),'unique_readers',count(distinct e.visitor_id) filter(where e.event_type='post_view'),
    'engaged_readers',count(distinct e.visitor_id) filter(where e.event_type='engaged_10s'),'scroll_90',count(*) filter(where e.event_type='scroll_90'),
    'cta_clicks',count(*) filter(where e.event_type='cta_click'),'share_clicks',count(*) filter(where e.event_type='share_click'),
    'registrations',(select count(*) from public.company_registration_attributions a where (p_post_id is null or a.post_id=p_post_id) and a.attributed_at>=p_since),
    'posts',coalesce((select jsonb_agg(x order by (x->>'views')::int desc) from(
      select jsonb_build_object('post_id',p.id,'slug',p.slug,'title',max(v.title),'views',count(*) filter(where be.event_type='post_view'),
        'unique_readers',count(distinct be.visitor_id) filter(where be.event_type='post_view'),
        'cta_clicks',count(*) filter(where be.event_type='cta_click'),
        'registrations',(select count(*) from public.company_registration_attributions a where a.post_id=p.id and a.attributed_at>=p_since)) x
      from public.blog_posts p join public.blog_post_versions v on v.post_id=p.id and v.publication_state='published'
      left join public.blog_events be on be.post_id=p.id and be.occurred_at>=p_since
      where p_post_id is null or p.id=p_post_id group by p.id,p.slug
    ) ranked),'[]'::jsonb)
  ) into v_result from public.blog_events e where e.occurred_at>=p_since and (p_post_id is null or e.post_id=p_post_id);
  return v_result;
end;
$$;
revoke execute on function public.platform_blog_metrics(timestamptz,uuid) from public,anon;
grant execute on function public.platform_blog_metrics(timestamptz,uuid) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Terms-aware registration core. Existing RPC is retained for old clients.
-- ---------------------------------------------------------------------------
create or replace function public.provision_company_registration_core(
  p_company_name text,p_store_name text,p_currency text,p_email text,p_address text,p_trial_tier_code text,
  p_terms_version text,p_terms_content_sha256 text,p_owner_name text,p_blog_ref uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id uuid;v_document_id uuid;v_owner_name text:=nullif(trim(coalesce(p_owner_name,'')),'');v_auto boolean:=false;v_event public.blog_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_owner_name is not null and (v_owner_name is null or length(v_owner_name)>120) then raise exception 'invalid_owner_name'; end if;
  select id into v_document_id from public.legal_document_versions where document_type='terms'
    and publication_state='published' and effective_at<=now() and version=p_terms_version
    and content_sha256=lower(p_terms_content_sha256);
  if v_document_id is null then raise exception 'legal_document_mismatch'; end if;
  v_company_id:=public.provision_company(p_company_name,p_store_name,p_currency,p_email,p_address,p_trial_tier_code);
  if v_owner_name is not null then
    insert into public.company_staff_profiles(company_id,user_id,display_name) values(v_company_id,auth.uid(),v_owner_name)
    on conflict(company_id,user_id) do update set display_name=excluded.display_name,updated_at=now();
  end if;
  insert into public.company_legal_acceptances(company_id,document_version_id,accepted_by,source)
    values(v_company_id,v_document_id,auth.uid(),'registration');
  if p_blog_ref is not null then
    select * into v_event from public.blog_events where id=p_blog_ref and event_type='cta_click' and occurred_at>=now()-interval '30 days';
    if v_event.id is not null then
      insert into public.company_registration_attributions(company_id,post_id,click_event_id)
      values(v_company_id,v_event.post_id,v_event.id) on conflict do nothing;
    end if;
  end if;
  select automatic_company_approval_enabled into v_auto
    from public.platform_registration_settings where singleton for share;
  if coalesce(v_auto,false) then perform public.approve_company_transition(v_company_id,'automatic'); end if;
  return jsonb_build_object('company_id',v_company_id,'company_status',case when coalesce(v_auto,false) then 'approved' else 'unapproved' end,
    'approval_mode',case when coalesce(v_auto,false) then 'automatic' else 'manual' end);
end;
$$;
revoke execute on function public.provision_company_registration_core(text,text,text,text,text,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.provision_company_registration(
  p_company_name text,p_store_name text default 'Main Store',p_currency text default 'KES',p_email text default null,
  p_address text default null,p_trial_tier_code text default null,p_terms_version text default null,
  p_terms_content_sha256 text default null,p_owner_name text default null,p_blog_ref uuid default null
) returns jsonb language sql security definer set search_path='' as $$
  select public.provision_company_registration_core(p_company_name,p_store_name,p_currency,p_email,p_address,
    p_trial_tier_code,p_terms_version,p_terms_content_sha256,p_owner_name,p_blog_ref);
$$;
revoke execute on function public.provision_company_registration(text,text,text,text,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.provision_company_registration(text,text,text,text,text,text,text,text,text,uuid) to authenticated,service_role;

create or replace function public.provision_company_with_terms(
  p_company_name text,p_store_name text default 'Main Store',p_currency text default 'KES',p_email text default null,
  p_address text default null,p_trial_tier_code text default null,p_terms_version text default null,
  p_terms_content_sha256 text default null,p_owner_name text default null
) returns uuid language sql security definer set search_path='' as $$
  select (public.provision_company_registration_core(p_company_name,p_store_name,p_currency,p_email,p_address,
    p_trial_tier_code,p_terms_version,p_terms_content_sha256,p_owner_name,null)->>'company_id')::uuid;
$$;
revoke execute on function public.provision_company_with_terms(text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.provision_company_with_terms(text,text,text,text,text,text,text,text,text) to authenticated,service_role;

-- Edge Function helpers.
create or replace function public.claim_public_site_deployment()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_deployment uuid;v_request_ids uuid[];
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('public_site_deployment')::bigint) then return null; end if;
  if exists(select 1 from public.public_site_deployments where status in ('queued','running')) then return null; end if;
  select array_agg(id order by created_at) into v_request_ids from public.public_site_deploy_requests
    where status='pending' and next_attempt_at<=now();
  if coalesce(cardinality(v_request_ids),0)=0 then return null; end if;
  insert into public.public_site_deployments(status) values('queued') returning id into v_deployment;
  update public.public_site_deploy_requests set status='claimed',deployment_id=v_deployment,
    attempt_count=attempt_count+1 where id=any(v_request_ids);
  return jsonb_build_object('deployment_id',v_deployment,'request_ids',v_request_ids);
end;
$$;
revoke execute on function public.claim_public_site_deployment() from public,anon,authenticated;
grant execute on function public.claim_public_site_deployment() to service_role;

create or replace function public.finalize_public_site_deployment(
  p_deployment_id uuid,p_status text,p_error_summary text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_current_status text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if p_status not in ('succeeded','failed','cancelled','timed_out') then raise exception 'invalid_deployment_status'; end if;
  select status into v_current_status from public.public_site_deployments
    where id=p_deployment_id for update;
  if v_current_status is null then raise exception 'deployment_not_found'; end if;

  if p_status='succeeded' then
    update public.public_site_deploy_requests set status='succeeded',completed_at=coalesce(completed_at,now())
      where deployment_id=p_deployment_id and status='claimed';
  else
    update public.public_site_deploy_requests set status='pending',deployment_id=null,completed_at=null,
      next_attempt_at=now()+make_interval(mins=>least(30,power(2,greatest(0,attempt_count-1))::integer))
      where deployment_id=p_deployment_id and status='claimed' and attempt_count<3;
    update public.public_site_deploy_requests set status='failed',completed_at=coalesce(completed_at,now())
      where deployment_id=p_deployment_id and status='claimed' and attempt_count>=3;
  end if;
  update public.public_site_deployments set status=p_status,completed_at=coalesce(completed_at,now()),
    error_summary=left(p_error_summary,500),updated_at=now() where id=p_deployment_id;
  return true;
end;
$$;
revoke execute on function public.finalize_public_site_deployment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.finalize_public_site_deployment(uuid,text,text) to service_role;

create or replace function public.platform_site_deployments()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb) into v_result
    from(select * from public.public_site_deployments order by created_at desc limit 30)d;
  return v_result;
end;
$$;
revoke execute on function public.platform_site_deployments() from public,anon;
grant execute on function public.platform_site_deployments() to authenticated,service_role;

-- Invoke the deploy dispatcher every minute when SITE_DEPLOY_URL is configured
-- in Vault. Local development intentionally has no URL and becomes a no-op.
create or replace function public.trigger_public_site_deploy()
returns void language plpgsql security definer set search_path='' as $$
declare v_url text;v_key text;
begin
  select max(case when name='SITE_DEPLOY_URL' then decrypted_secret end),
    max(case when name='SUPABASE_SERVICE_ROLE_KEY' then decrypted_secret end)
  into v_url,v_key from vault.decrypted_secrets
  where name in('SITE_DEPLOY_URL','SUPABASE_SERVICE_ROLE_KEY');
  if nullif(v_url,'') is null or nullif(v_key,'') is null then return; end if;
  perform net.http_post(url:=v_url,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
    body:='{}'::jsonb,timeout_milliseconds:=30000);
end;
$$;
revoke execute on function public.trigger_public_site_deploy() from public,anon,authenticated;
grant execute on function public.trigger_public_site_deploy() to service_role;
select cron.schedule('public-site-deploy','* * * * *',$$select public.trigger_public_site_deploy()$$);

select pg_notify('pgrst','reload schema');
