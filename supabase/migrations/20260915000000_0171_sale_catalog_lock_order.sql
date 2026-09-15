-- Sales retain variant/pack row locks until their cache journal writes finish.
-- Take the catalog advisory lock first: shared for sales, exclusive for writers.
-- Shared locks keep independent sales concurrent while excluding catalog edits.
-- Checkout must join this ordering before locking its source draft as well.
--
-- Legacy catalog RPCs need the same early lock. A row trigger runs after UPDATE
-- has locked its target, which is too late when a sale already holds a shared
-- catalog lock. The pack editor and purchase entry points already lock early.
-- Keep the existing function bodies, permissions, and configuration intact;
-- insert only the lock preamble into these explicitly named entry points.
do $$
declare
  v_target record;
  v_definition text;
  v_position integer;
  v_anchor text := E'\nbegin\n';
  v_lock text;
begin
  for v_target in
    select * from (values
      ('public.resolve_sale_units(jsonb)', true),
      ('public.prepare_sale_order_core(uuid,jsonb,text,uuid)', true),
      ('public.update_catalog_product(uuid,text,jsonb,text,boolean)', false),
      ('public.upsert_variant(uuid,text,bigint,uuid,text,text,bigint,boolean,boolean,boolean,text)', false),
      ('public.update_product(uuid,text,text,text,boolean)', false),
      ('public.set_product_image(uuid,text,text)', false),
      ('public.set_product_tax_category(uuid,uuid)', false),
      ('public.apply_catalog_price_updates(jsonb)', false),
      ('public.assign_missing_variant_barcodes(jsonb)', false),
      ('public.finalize_catalog_import(uuid)', false),
      ('public.apply_catalog_workbook_updates(jsonb,jsonb,jsonb,jsonb,uuid)', false),
      ('public.apply_catalog_workbook_core(jsonb,jsonb,jsonb,uuid)', false),
      ('public.apply_catalog_workbook_inventory_changes(jsonb,jsonb)', false)
    ) targets(signature, shared)
  loop
    select pg_get_functiondef(v_target.signature::regprocedure) into v_definition;
    v_position := strpos(v_definition, v_anchor);
    if v_position = 0 then
      raise exception 'catalog_lock_migration_unexpected_body: %', v_target.signature;
    end if;
    v_lock := format(
      $lock$  -- Catalog lock precedes document, variant, pack, and cache journal locks.
  perform pg_advisory_xact_lock%s(hashtextextended('catalog-units:' || public.current_company_id()::text, 0));
$lock$,
      case when v_target.shared then '_shared' else '' end
    );
    execute substr(v_definition, 1, v_position + length(v_anchor) - 1)
      || v_lock || substr(v_definition, v_position + length(v_anchor));
  end loop;
end;
$$;
