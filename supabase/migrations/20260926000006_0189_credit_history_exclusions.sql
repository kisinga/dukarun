-- Corrective settlements repair exposure, but they are not evidence that a
-- customer or supplier paid on time. Keep an explicit, auditable exclusion
-- instead of rewriting payment dates or financial history.

create table public.credit_document_history_exclusions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  side text not null check(side in ('customer','supplier')),
  party_id uuid not null references public.customers(id) on delete cascade,
  document_id uuid not null,
  reason text not null check(nullif(btrim(reason),'') is not null),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(company_id,side,document_id)
);

create index credit_document_history_exclusions_party_idx
  on public.credit_document_history_exclusions(company_id,side,party_id);

alter table public.credit_document_history_exclusions enable row level security;
revoke all on public.credit_document_history_exclusions
  from public,anon,authenticated;
grant all on public.credit_document_history_exclusions to service_role;

create trigger credit_document_history_exclusions_audit
after insert or update or delete on public.credit_document_history_exclusions
for each row execute function public.audit_trigger();

create or replace function public.skip_excluded_credit_document_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An exclusion never hides live exposure. It applies only after the source
  -- document is fully settled through the normal financial subledger.
  if new.outstanding_amount = 0 and exists(
    select 1
    from public.credit_document_history_exclusions e
    where e.company_id = new.company_id
      and e.side = new.side
      and e.party_id = new.party_id
      and e.document_id = new.document_id
  ) then
    return null;
  end if;
  return new;
end;
$$;

revoke execute on function public.skip_excluded_credit_document_history()
  from public,anon,authenticated;

drop trigger if exists aa_skip_excluded_credit_document_history
  on public.credit_document_performance;
create trigger aa_skip_excluded_credit_document_history
before insert on public.credit_document_performance
for each row execute function public.skip_excluded_credit_document_history();

create or replace function public.enqueue_credit_history_exclusion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.credit_document_history_exclusions%rowtype;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  perform public.enqueue_credit_party(
    v_row.company_id,v_row.side,v_row.party_id,'corrective_history_exclusion');
  return coalesce(new,old);
end;
$$;

revoke execute on function public.enqueue_credit_history_exclusion()
  from public,anon,authenticated;

create trigger credit_document_history_exclusions_enqueue
after insert or update or delete on public.credit_document_history_exclusions
for each row execute function public.enqueue_credit_history_exclusion();

