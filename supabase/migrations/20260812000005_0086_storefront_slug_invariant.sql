-- Public storefront paths are consumed by browsers, crawlers, and nginx.
-- Keep the route contract in the database so no client can persist a slug
-- that the public routing layer cannot serve.

update public.companies
set public_slug = 'tesla'
where public_slug = 'Tesla';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.companies'::regclass
      and conname = 'companies_public_slug_format_check'
  ) then
    alter table public.companies
      add constraint companies_public_slug_format_check
      check (
        public_slug is null
        or (
          char_length(public_slug) between 1 and 63
          and public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        )
      );
  end if;
end;
$$;
