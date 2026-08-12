-- Platform editors may permanently remove an article. Media stays append-only,
-- and posts used for registration attribution retain their audit relationship.

create or replace function public.platform_delete_blog_post(p_post_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_platform_admin();

  perform 1 from public.blog_posts where id=p_post_id for update;
  if not found then raise exception 'blog_post_not_found'; end if;

  if exists(
    select 1 from public.company_registration_attributions where post_id=p_post_id
  ) then
    raise exception 'blog_post_has_registration_attributions';
  end if;

  delete from public.blog_posts where id=p_post_id;
  return true;
end;
$$;

revoke execute on function public.platform_delete_blog_post(uuid) from public,anon;
grant execute on function public.platform_delete_blog_post(uuid) to authenticated,service_role;

select pg_notify('pgrst','reload schema');
