-- Every creation path, including company provisioning, makes the first location default.
create or replace function public.ensure_first_stock_location_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.stock_locations where company_id = new.company_id
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_locations_first_default on public.stock_locations;
create trigger stock_locations_first_default
  before insert on public.stock_locations
  for each row execute function public.ensure_first_stock_location_default();

