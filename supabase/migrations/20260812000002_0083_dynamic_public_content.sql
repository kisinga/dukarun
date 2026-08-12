-- Blog articles, listings, social previews, and sitemaps are rendered from the
-- current public projections. Publishing no longer requires a frontend build.

create or replace function public.public_storefront_sitemap()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',q.slug,'product_id',q.product_id,'updated_at',q.updated_at
  ) order by q.slug,q.product_id),'[]'::jsonb)
  from (
    select c.public_slug slug,p.id product_id,p.updated_at
    from public.companies c
    left join public.products p
      on p.company_id=c.id and p.active and public.storefront_catalogue_visible(c)
      and exists(select 1 from public.product_variants v where v.product_id=p.id and v.active)
    where c.status='approved' and c.public_storefront_enabled and c.public_slug is not null
      and public.storefront_catalogue_visible(c)
  ) q;
$$;
revoke execute on function public.public_storefront_sitemap() from public;
grant execute on function public.public_storefront_sitemap() to anon,authenticated,service_role;

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
  return jsonb_build_object('post_id',p_post_id,'revision_id',v_version.id,'published_at',v_now);
end;
$$;
revoke execute on function public.platform_publish_blog_post(uuid) from public,anon;
grant execute on function public.platform_publish_blog_post(uuid) to authenticated,service_role;

create or replace function public.platform_archive_blog_post(p_post_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  update public.blog_posts set archived_at=now(),updated_at=now() where id=p_post_id;
  if not found then raise exception 'blog_post_not_found'; end if;
  update public.blog_post_versions set publication_state='superseded',scheduled_for=null,updated_at=now()
    where post_id=p_post_id and publication_state in ('published','scheduled');
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
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.publish_due_blog_posts() from public,anon,authenticated;
grant execute on function public.publish_due_blog_posts() to service_role;

-- Retire requests already queued solely to refresh blog build artifacts. Keep
-- the generic deployment machinery for legal/pricing/manual rebuild requests.
update public.public_site_deploy_requests
set status='succeeded',completed_at=coalesce(completed_at,now())
where reason in ('blog_publish','blog_archive') and status='pending';

-- Keep the generic dispatcher dormant when no build-backed resource needs
-- work. Active deployments are still polled until they reach a terminal state.
create or replace function public.trigger_public_site_deploy()
returns void language plpgsql security definer set search_path='' as $$
declare v_url text;v_key text;
begin
  if not exists(
    select 1 from public.public_site_deploy_requests
    where status='pending' and next_attempt_at<=now()
  ) and not exists(
    select 1 from public.public_site_deployments where status in ('queued','running')
  ) then return; end if;
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

select pg_notify('pgrst','reload schema');
