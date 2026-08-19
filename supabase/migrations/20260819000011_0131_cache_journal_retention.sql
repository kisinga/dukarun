-- Retain enough logical changes for ten hours at 100 sales/hour, plus a
-- modest burst margin. Sync responses remain bounded to 512 changes per page.
create or replace function public.prune_cache_change_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_deleted integer := 0;
begin
  with cutoffs as (
    select company_id, stream, greatest(head_sequence - 1280, 0) as cutoff
    from public.cache_stream_heads
    where head_sequence > 1280
  ), deleted as (
    delete from public.cache_change_log log
    using cutoffs cutoff
    where log.company_id = cutoff.company_id
      and log.stream = cutoff.stream
      and log.sequence <= cutoff.cutoff
    returning 1
  )
  select count(*)::integer into v_deleted from deleted;

  update public.cache_stream_heads head
  set pruned_through_sequence = greatest(
        head.pruned_through_sequence,
        greatest(head.head_sequence - 1280, 0)
      ),
      updated_at = now()
  where head.head_sequence > 1280;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_cache_change_log() from public, anon, authenticated;
grant execute on function public.prune_cache_change_log() to service_role;

comment on function public.prune_cache_change_log() is
  'Hourly pruning retains exactly 1,280 logical changes per company and stream. Page size does not affect retention.';
