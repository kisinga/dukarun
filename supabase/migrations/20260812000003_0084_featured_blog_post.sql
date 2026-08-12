-- One editorial choice powers the featured story on both the homepage and blog.

alter table public.blog_posts
  add column featured_at timestamptz;

create unique index blog_posts_single_featured_idx
  on public.blog_posts ((true))
  where featured_at is not null;

create or replace function public.clear_archived_blog_feature()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.archived_at is not null then new.featured_at := null; end if;
  return new;
end;
$$;

create trigger clear_archived_blog_feature
before update of archived_at on public.blog_posts
for each row execute function public.clear_archived_blog_feature();

create or replace function public.platform_feature_blog_post(p_post_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();
  lock table public.blog_posts in share row exclusive mode;

  if not exists (
    select 1
    from public.blog_posts p
    join public.blog_post_versions v
      on v.post_id=p.id and v.publication_state='published'
    where p.id=p_post_id and p.archived_at is null
  ) then
    raise exception 'blog_post_not_published';
  end if;

  update public.blog_posts set featured_at=null where featured_at is not null;
  update public.blog_posts set featured_at=now(),updated_at=now() where id=p_post_id;
  return true;
end;
$$;
revoke execute on function public.platform_feature_blog_post(uuid) from public,anon;
grant execute on function public.platform_feature_blog_post(uuid) to authenticated,service_role;

create or replace function public.platform_blog_posts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.assert_platform_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'post_id',p.id,'slug',p.slug,'archived_at',p.archived_at,'featured_at',p.featured_at,
    'created_at',p.created_at,'updated_at',p.updated_at,
    'revision_id',v.id,'version_number',v.version_number,
    'publication_state',case when p.archived_at is not null then 'archived' else coalesce(v.publication_state,'empty') end,
    'has_published_version',exists(
      select 1 from public.blog_post_versions published
      where published.post_id=p.id and published.publication_state='published'
    ),
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
    'post_id',p.id,'slug',p.slug,'archived_at',p.archived_at,'featured_at',p.featured_at,
    'created_at',p.created_at,'updated_at',p.updated_at,
    'revision_id',v.id,'version_number',v.version_number,
    'publication_state',case when p.archived_at is not null then 'archived' else coalesce(v.publication_state,'empty') end,
    'has_published_version',exists(
      select 1 from public.blog_post_versions published
      where published.post_id=p.id and published.publication_state='published'
    ),
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

create or replace function public.public_featured_blog_post()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'post_id',p.id,'slug',p.slug,'title',v.title,'excerpt',v.excerpt,'author_name',v.author_name,
    'cover_image_path',v.cover_image_path,'cover_image_alt',v.cover_image_alt,'tags',v.tags,
    'seo_title',coalesce(v.seo_title,v.title),'seo_description',coalesce(v.seo_description,v.excerpt),
    'published_at',v.published_at,
    'reading_minutes',ceil(array_length(regexp_split_to_array(v.content_markdown,'\s+'),1)/200.0)::int
  )
  from public.blog_posts p
  join public.blog_post_versions v on v.post_id=p.id and v.publication_state='published'
  where p.archived_at is null
  order by (p.featured_at is not null) desc,p.featured_at desc nulls last,v.published_at desc,p.id desc
  limit 1;
$$;
revoke execute on function public.public_featured_blog_post() from public;
grant execute on function public.public_featured_blog_post() to anon,authenticated,service_role;

select pg_notify('pgrst','reload schema');
