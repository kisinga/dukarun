-- Publish product_variants so the shared catalog cache can patch its
-- IndexedDB snapshot from realtime row events (products is already published).
alter publication supabase_realtime add table public.product_variants;
