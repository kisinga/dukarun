-- Party cache patches/invalidation require customer directory changes in realtime.
alter publication supabase_realtime add table public.customers;
