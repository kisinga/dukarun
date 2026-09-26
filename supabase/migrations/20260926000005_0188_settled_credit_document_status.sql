-- A settled document may retain historical punctuality evidence, but it no
-- longer has current aging. Enforce that distinction for customer and supplier
-- credit projections, including rows adjusted by refund-credit triggers.

create or replace function public.normalize_credit_document_current_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.outstanding_amount = 0 then
    new.overdue_days := 0;
    new.next_refresh_on := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.normalize_credit_document_current_status()
  from public, anon, authenticated;

drop trigger if exists zz_credit_document_current_status
  on public.credit_document_performance;
create trigger zz_credit_document_current_status
before insert or update of outstanding_amount, overdue_days, next_refresh_on
on public.credit_document_performance
for each row execute function public.normalize_credit_document_current_status();

update public.credit_document_performance
set overdue_days = 0,
    next_refresh_on = null
where outstanding_amount = 0
  and (overdue_days <> 0 or next_refresh_on is not null);

alter table public.credit_document_performance
  drop constraint if exists credit_document_settled_not_aged;
alter table public.credit_document_performance
  add constraint credit_document_settled_not_aged
  check (outstanding_amount > 0 or (overdue_days = 0 and next_refresh_on is null));
