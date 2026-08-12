-- Keep blog publications CMS-authored and their covers storage-backed.

-- Archive the original seed only when it is still the untouched, single
-- revision created by migration 0085. If an editor has revised it, preserve it.
update public.blog_posts p
set archived_at=coalesce(p.archived_at,now()),featured_at=null,updated_at=now()
where p.id='8b739c39-a7c8-4e78-a275-ff415485846d'
  and p.slug='salon-sales-with-barcode-service-menu'
  and (select count(*) from public.blog_post_versions v where v.post_id=p.id)=1
  and exists(
    select 1 from public.blog_post_versions v
    where v.post_id=p.id
      and v.id='ad3874af-06ad-496d-bf69-b174530df71d'
      and v.version_number=1
  );

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

revoke execute on function public.validate_blog_fields(text,text,text,text,text,text,text,text[],text,text)
  from public,anon,authenticated;

-- Preserve 0085's reading-time correction so fresh databases and databases
-- that ran the original migration converge on the same function definitions.
create or replace function public.public_blog_posts(
  p_limit integer default 12,p_before timestamptz default null,p_before_id uuid default null,p_tag text default null
)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.published_at desc,q.post_id desc),'[]'::jsonb) from(
    select p.id post_id,p.slug,v.title,v.excerpt,v.author_name,v.cover_image_path,v.cover_image_alt,v.tags,
      coalesce(v.seo_title,v.title) seo_title,coalesce(v.seo_description,v.excerpt) seo_description,
      v.published_at,ceil(array_length(regexp_split_to_array(v.content_markdown,'\s+'),1)/200.0)::int reading_minutes
    from public.blog_posts p join public.blog_post_versions v on v.post_id=p.id and v.publication_state='published'
    where p.archived_at is null and (p_before is null or v.published_at<p_before
      or (v.published_at=p_before and p_before_id is not null and p.id<p_before_id))
      and (p_tag is null or p_tag=any(v.tags))
    order by v.published_at desc,p.id desc limit least(greatest(p_limit,1),50)
  ) q;
$$;
revoke execute on function public.public_blog_posts(integer,timestamptz,uuid,text) from public;
grant execute on function public.public_blog_posts(integer,timestamptz,uuid,text)
  to anon,authenticated,service_role;

create or replace function public.public_blog_post(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('post_id',p.id,'revision_id',v.id,'slug',p.slug,'title',v.title,'excerpt',v.excerpt,
    'content_markdown',v.content_markdown,'author_name',v.author_name,'cover_image_path',v.cover_image_path,
    'cover_image_alt',v.cover_image_alt,'tags',v.tags,'seo_title',coalesce(v.seo_title,v.title),
    'seo_description',coalesce(v.seo_description,v.excerpt),'published_at',v.published_at,
    'updated_at',v.updated_at,'reading_minutes',ceil(array_length(regexp_split_to_array(v.content_markdown,'\s+'),1)/200.0)::int)
  from public.blog_posts p join public.blog_post_versions v on v.post_id=p.id and v.publication_state='published'
  where p.slug=p_slug and p.archived_at is null limit 1;
$$;
revoke execute on function public.public_blog_post(text) from public;
grant execute on function public.public_blog_post(text) to anon,authenticated,service_role;

select pg_notify('pgrst','reload schema');
