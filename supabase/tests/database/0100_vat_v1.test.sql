begin;
-- Tax-profile effective dates are company-business dates, not runner UTC dates.
set local timezone to 'Africa/Nairobi';
select plan(99);

select has_table('public','tax_rate_versions','VAT rates are effective-dated');
select has_table('public','legacy_customer_account_reconciliations',
  'legacy UI balances have explicit document reconciliation records');
select has_table('public','company_tax_profiles','company VAT profiles are versioned');
select has_table('public','tax_documents','statutory document snapshots are durable');
select has_table('public','tax_export_artifacts','provider exports are immutable artifacts');
select has_table('public','period_closing_packs','period closing packs are durable');
select has_function('public','resolve_inclusive_tax',array['uuid','uuid','bigint','timestamp with time zone'],
  'authoritative inclusive-tax resolver exists');
select has_function('public','post_full_refund',array['uuid','text','text','text'],
  'full-sale credit note RPC exists');
select has_function('public','estimate_order_tax',array['uuid'],
  'draft tax estimate RPC exists');
select has_function('public','platform_tax_package_readiness',array['uuid'],
  'country-package readiness RPC exists');
select has_function('public','tax_document_integration_envelope',array['uuid','text'],
  'provider-neutral tax-document envelope RPC exists');
select has_function('public','purchase_tax_context',array['uuid[]','date'],
  'purchase editor can fetch effective tax rates without recalculating on every keystroke');
select has_function('public','calculate_purchase_invoice_tax',
  array['uuid','jsonb','jsonb','date'],
  'purchase finalization has an invoice-tax calculator independent of claim eligibility');

select testkit.create_user('a1000000-0000-4000-8000-000000000001','vat-v1@test.local');
select testkit.create_user('a1000000-0000-4000-8000-000000000002','vat-platform@test.local');
insert into public.platform_admins(user_id)
values ('a1000000-0000-4000-8000-000000000002');
create temp table vat_fixture as select testkit.provision(
  'a1000000-0000-4000-8000-000000000001','VAT v1 Store') company_id;
grant select on pg_temp.vat_fixture to authenticated;

update public.company_tax_profiles cp set
  vat_registered=true,
  tax_registration_number='P051234567A',
  default_tax_category_id=c.id,
  effective_from=current_date-100,
  created_by='a1000000-0000-4000-8000-000000000001'
from vat_fixture f
join public.tax_jurisdictions j on j.country_code='KE'
join public.tax_categories c on c.jurisdiction_id=j.id and c.code='STANDARD'
where cp.company_id=f.company_id and cp.jurisdiction_id=j.id;
update public.companies set show_vat_breakdown_on_prints=true,business_timezone='Africa/Nairobi'
where id=(select company_id from vat_fixture);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated","is_platform_admin":true}';
create temp table vat_future_rate as select public.platform_publish_tax_rate_version(
  (select c.id from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where j.country_code='KE' and c.code='STANDARD'),
  1700,current_date+365,null,'Scheduled regression rate') rate_id;
select results_eq(
  $$select old.effective_to,new.effective_from,new.rate_bps
    from public.tax_rate_versions old cross join public.tax_rate_versions new
    where old.tax_category_id=new.tax_category_id
      and old.effective_from=date '2013-09-02'
      and new.id=(select rate_id from vat_future_rate)$$,
  $$values (current_date+364,current_date+365,1700)$$,
  'publishing a successor atomically closes an open-ended rate');
select throws_ok(format($$select public.platform_publish_tax_rate_version(%L,1800,current_date,null,'Retroactive')$$,
  (select c.id from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where j.country_code='KE' and c.code='STANDARD')),
  'P0001','published_tax_rate_cannot_be_retroactively_superseded',
  'published rates cannot be superseded retroactively');
create temp table draft_tax_package as select public.platform_upsert_tax_jurisdiction(
  'UG','Uganda','UGX','Africa/Kampala',false) jurisdiction_id;
select is((public.platform_tax_package_readiness(
  (select jurisdiction_id from draft_tax_package))->>'ready')::boolean,false,
  'an incomplete country package stays in draft with readiness blockers');
create temp table draft_tax_categories as
select 'STANDARD' code,public.platform_upsert_tax_category(
  (select jurisdiction_id from draft_tax_package),'STANDARD','Standard','standard',true,true) id
union all select 'ZERO',public.platform_upsert_tax_category(
  (select jurisdiction_id from draft_tax_package),'ZERO','Zero-rated','zero_rated',false,true)
union all select 'EXEMPT',public.platform_upsert_tax_category(
  (select jurisdiction_id from draft_tax_package),'EXEMPT','Exempt','exempt',false,true);
select public.platform_publish_tax_rate_version(id,
  case when code='STANDARD' then 1800 else 0 end,current_date,null,'Readiness fixture')
from draft_tax_categories;
create temp table published_tax_package as select public.platform_publish_tax_package(
  (select jurisdiction_id from draft_tax_package)) result;
select results_eq(
  $$select result->>'status',(result->>'ready')::boolean from published_tax_package$$,
  $$values ('published'::text,true)$$,
  'a complete country package publishes atomically');
select throws_ok(format($$select public.platform_upsert_tax_category(%L,'STANDARD','Changed','special',true,true)$$,
  (select jurisdiction_id from draft_tax_package)),
  'P0001','published_tax_category_meaning_immutable',
  'published category codes and classifications are immutable');
create temp table future_tax_category as select public.platform_upsert_tax_category(
  (select jurisdiction_id from draft_tax_package),'SPECIAL_FUTURE','Future special','special',false,false) id;
select public.platform_publish_tax_rate_version(
  (select id from future_tax_category),500,current_date+30,null,'Prospective category fixture');
select is((select active from public.tax_categories where id=(select id from future_tax_category)),false,
  'a new treatment on a published package remains hidden until explicitly activated');
select lives_ok(format($$select public.platform_publish_tax_category(%L,current_date+30)$$,
  (select id from future_tax_category)),
  'a published package can evolve through a future-dated treatment activation');
select public.upsert_tax_integration_reference_code(
  'KRA_ETIMS','item_classification','14111501','Fixture item classification',true);
select public.upsert_tax_integration_reference_code(
  'KRA_ETIMS','item_type','1','Product',true);
select public.upsert_tax_integration_reference_code(
  'KRA_ETIMS','country','KE','Kenya',true);
select public.upsert_tax_integration_reference_code(
  'KRA_ETIMS','packaging_unit','NT','Net',true);
select public.upsert_tax_integration_reference_code(
  'KRA_ETIMS','quantity_unit','U','Unit',true);
select public.upsert_tax_integration_reference_code(
  'KRA_ETIMS','payment_type','01','Cash',true);
select public.upsert_tax_integration_tender_mapping(
  (select id from public.tax_jurisdictions where country_code='KE'),
  'KRA_ETIMS','cash','01');
reset role;
select is((select count(*)::integer from public.tax_integration_rate_mappings m
  where m.tax_rate_version_id=(select rate_id from vat_future_rate)),0,
  'an unknown future tax rate stays unmapped instead of being mislabeled as non-VAT');

insert into public.products(id,company_id,name,tax_category_id)
select 'a1000000-0000-4000-8000-000000000010'::uuid,f.company_id,'Standard tea',null::uuid from vat_fixture f
union all
select 'a1000000-0000-4000-8000-000000000011'::uuid,f.company_id,'Zero medicine',c.id
from vat_fixture f join public.tax_categories c on c.code='ZERO'
  and c.jurisdiction_id=(select jurisdiction_id from public.company_tax_profiles where company_id=f.company_id)
union all
select 'a1000000-0000-4000-8000-000000000012'::uuid,f.company_id,'Exempt service',c.id
from vat_fixture f join public.tax_categories c on c.code='EXEMPT'
  and c.jurisdiction_id=(select jurisdiction_id from public.company_tax_profiles where company_id=f.company_id)
union all
select 'a1000000-0000-4000-8000-000000000013'::uuid,f.company_id,'Special petroleum',c.id
from vat_fixture f join public.tax_categories c on c.code='PETROLEUM'
  and c.jurisdiction_id=(select jurisdiction_id from public.company_tax_profiles where company_id=f.company_id);

insert into public.product_variants(id,product_id,company_id,name,sku,kind,price,wholesale_price,track_inventory)
select 'a1000000-0000-4000-8000-000000000020'::uuid,'a1000000-0000-4000-8000-000000000010'::uuid,company_id,'Default','VAT-STD','good',116,116,true from vat_fixture
union all select 'a1000000-0000-4000-8000-000000000021'::uuid,'a1000000-0000-4000-8000-000000000011'::uuid,company_id,'Default','VAT-ZERO','service',50,50,false from vat_fixture
union all select 'a1000000-0000-4000-8000-000000000022'::uuid,'a1000000-0000-4000-8000-000000000012'::uuid,company_id,'Default','VAT-EXEMPT','service',50,50,false from vat_fixture
union all select 'a1000000-0000-4000-8000-000000000023'::uuid,'a1000000-0000-4000-8000-000000000013'::uuid,company_id,'Default','VAT-SPECIAL','service',108,108,false from vat_fixture;

-- Product setup and business transactions share one pgTAP transaction. Move
-- treatment history earlier so the fixture models products configured before
-- their sales instead of relying on transaction-start now().
update public.product_tax_treatment_versions
set effective_from=now()-interval '1 day'
where product_id in (
  'a1000000-0000-4000-8000-000000000010'::uuid,
  'a1000000-0000-4000-8000-000000000011'::uuid,
  'a1000000-0000-4000-8000-000000000012'::uuid,
  'a1000000-0000-4000-8000-000000000013'::uuid
);

insert into public.customers(
  id,company_id,first_name,is_supplier,supplier_credit_limit,tax_registration_number)
select 'a1000000-0000-4000-8000-000000000030'::uuid,company_id,
  'VAT Supplier',true,100000,'P009999999Z' from vat_fixture
union all
select 'a1000000-0000-4000-8000-000000000032'::uuid,company_id,
  'VAT Buyer',false,0,null from vat_fixture;

create temp table vat_standard_resolution as
select gross_total,net_total,tax_total,tax_rate_bps from public.resolve_inclusive_tax(
  (select company_id from vat_fixture),'a1000000-0000-4000-8000-000000000010',116,now());
select results_eq(
  $$select gross_total,net_total,tax_total,tax_rate_bps from vat_standard_resolution$$,
  $$values (116::bigint,100::bigint,16::bigint,1600)$$,
  'inclusive standard VAT extracts net and tax without increasing gross');
create temp table vat_special_resolution as
select gross_total,net_total,tax_total,tax_rate_bps from public.resolve_inclusive_tax(
  (select company_id from vat_fixture),'a1000000-0000-4000-8000-000000000013',108,clock_timestamp());
select results_eq(
  $$select gross_total,net_total,tax_total,tax_rate_bps from vat_special_resolution$$,
  $$values (108::bigint,100::bigint,8::bigint,800)$$,
  'temporary effective-dated petroleum rate resolves at the tax point');

update public.company_tax_profiles set vat_registered=false,tax_registration_number=null
where company_id=(select company_id from vat_fixture) and effective_from<=current_date
  and (effective_to is null or effective_to>=current_date);
select results_eq(
  $$select tax_total,vat_registered from public.resolve_purchase_invoice_tax(
      (select company_id from vat_fixture),'a1000000-0000-4000-8000-000000000010',116,now())$$,
  $$values (16::bigint,false)$$,
  'supplier invoice VAT resolves independently of buyer registration');
select results_eq(
  $$select tax_total,vat_registered from public.resolve_inclusive_tax(
      (select company_id from vat_fixture),'a1000000-0000-4000-8000-000000000010',116,now())$$,
  $$values (0::bigint,false)$$,
  'sales VAT remains disabled when the shop is not registered');
update public.company_tax_profiles set vat_registered=true,tax_registration_number='P051234567A'
where company_id=(select company_id from vat_fixture) and effective_from<=current_date
  and (effective_to is null or effective_to>=current_date);

select testkit.as_user((select company_id from vat_fixture),
  'a1000000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();
select results_eq(
  $$select (line->>'tax_rate_bps')::integer
    from jsonb_array_elements(public.purchase_tax_context(
      array['a1000000-0000-4000-8000-000000000020'::uuid],current_date)->'lines') line$$,
  $$values (1600)$$,
  'purchase tax context resolves the effective product rate once for local editor calculations');
select is(public.update_location_tax_branch_code(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'00'),
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'finance administration can save a KRA branch ID');
select is(public.update_customer_tax_registration(
  'a1000000-0000-4000-8000-000000000032','P001234567B'),
  'a1000000-0000-4000-8000-000000000032'::uuid,
  'customer tax PIN updates through the existing customer-edit boundary');
select ok(public.upsert_tax_integration_item_mapping(
  'a1000000-0000-4000-8000-000000000020',
  (select id from public.tax_jurisdictions where country_code='KE'),'KRA_ETIMS',
  'KE-ITEM-STD','14111501','1','KE','NT','U','{}') is not null,
  'catalog management can map an item without coupling sales to an eTIMS adapter');

select public.schedule_company_tax_profile(
  (select j.id from public.tax_jurisdictions j where j.country_code='KE'),false,'',
  (select end_date+1 from public.accounting_periods
    where company_id=(select company_id from vat_fixture) and status='open'),
  (select c.id from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where j.country_code='KE' and c.code='STANDARD'));
select is(jsonb_array_length(public.company_tax_settings()->'scheduled_profiles'),1,
  'company VAT settings expose scheduled profiles');
select lives_ok(format($$select public.schedule_company_tax_profile(%L,false,'',current_date+1,%L)$$,
  (select j.id from public.tax_jurisdictions j where j.country_code='KE'),
  (select c.id from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where j.country_code='KE' and c.code='STANDARD')),
  'company tax changes may start safely inside an open accounting period');
select is(jsonb_array_length(public.company_tax_settings()->'scheduled_profiles'),2,
  'mid-month and later scheduled profiles are visible independently of period close');
select lives_ok(format($$select public.cancel_scheduled_company_tax_profile(%L)$$,
  (select id from public.company_tax_profiles
    where company_id=(select company_id from vat_fixture) and effective_from=current_date+1)),
  'an unused future tax profile can be cancelled');
select lives_ok(format($$select public.schedule_company_tax_profile(%L,true,'',current_date+2,%L)$$,
  (select j.id from public.tax_jurisdictions j where j.country_code='KE'),
  (select c.id from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where j.country_code='KE' and c.code='STANDARD')),
  'VAT accounting can be enabled without supplying invoice PIN metadata');
select is((select tax_registration_number from public.company_tax_profiles
  where company_id=(select company_id from vat_fixture) and effective_from=current_date+2),null,
  'an enabled VAT profile stores a missing invoice PIN as null');
select is(public.update_company_tax_registration_number(
  (select id from public.company_tax_profiles
    where company_id=(select company_id from vat_fixture) and effective_from=current_date+2),
  'P051234567A'),
  (select id from public.company_tax_profiles
    where company_id=(select company_id from vat_fixture) and effective_from=current_date+2),
  'invoice PIN metadata can be added without rescheduling VAT');
select public.cancel_scheduled_company_tax_profile(
  (select id from public.company_tax_profiles
    where company_id=(select company_id from vat_fixture) and effective_from=current_date+2));

select throws_ok($$select public.post_expense_with_tax(116,'CASH_ON_HAND','transport','Fuel',
  current_date,true,null,null,null,null)$$,'P0001','input_vat_evidence_required',
  'input VAT cannot be claimed without supplier evidence');
create temp table vat_expense as select public.post_expense_with_tax(116,'CASH_ON_HAND','transport',
  'Fuel',current_date,true,'P009999999Z','EXP-VAT-1',current_date,null) expense_id;
grant select on pg_temp.vat_expense to authenticated;
select results_eq(
  $$select gross_total,net_total,input_tax_total from public.expense_documents
    where id=(select expense_id from vat_expense)$$,
  $$values (116::bigint,100::bigint,16::bigint)$$,
  'evidenced expense stores gross, net, and recoverable VAT snapshots');
select throws_ok(format($$select public.schedule_company_tax_profile(%L,false,'',current_date,%L)$$,
  (select j.id from public.tax_jurisdictions j where j.country_code='KE'),
  (select c.id from public.tax_categories c join public.tax_jurisdictions j
    on j.id=c.jurisdiction_id where j.country_code='KE' and c.code='STANDARD')),
  'P0001','tax_profile_today_has_financial_activity',
  'same-day activation is blocked after a financial transaction finalizes');
create temp table vat_dated_expense as select public.post_expense_with_tax(
  116,'CASH_ON_HAND','transport','Prior invoice',current_date,true,
  'P009999999Z','EXP-VAT-2',current_date-1,null) expense_id;
select results_eq(
  $$select (d.tax_point_at at time zone 'Africa/Nairobi')::date,e.entry_date
    from public.expense_documents d join public.ledger_journal_entries e on e.id=d.journal_entry_id
    where d.id=(select expense_id from vat_dated_expense)$$,
  $$values (current_date-1,current_date-1)$$,
  'expense snapshot and journal use the invoice tax point');

select results_eq(
  $$select (x->>'gross_total')::bigint,(x->>'net_total')::bigint,
      (x->>'tax_total')::bigint,(x->>'separate_expense_total')::bigint
    from (select public.estimate_purchase_input_vat(
      '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
      '[{"category":"transport","amount":116,"settlement":"supplier_bill"},{"category":"loading","amount":50,"settlement":"separate","account_code":"CASH_ON_HAND"}]',
      current_date) x) q$$,
  $$values (232::bigint,200::bigint,32::bigint,50::bigint)$$,
  'purchase VAT preview extracts supplier-bill VAT and excludes separately paid expenses');

select public.update_supplier_tax_registration(
  'a1000000-0000-4000-8000-000000000030','');
select throws_ok($$select public.record_purchase_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[]',116,'SUP-MISSING-PIN','CASH_ON_HAND',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  true,null,'SUP-MISSING-PIN',current_date)$$,
  'P0001','supplier_tax_pin_required',
  'claiming purchase VAT requires a PIN saved on the supplier master');
select is(public.update_supplier_tax_registration(
  'a1000000-0000-4000-8000-000000000030','P009999999Z'),
  'a1000000-0000-4000-8000-000000000030'::uuid,
  'supplier tax PIN updates through the secured supplier boundary');

create temp table vat_purchase as select public.record_purchase_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":10,"unit_cost":116,"line_total":1160,"value_source":"unit"}]',
  '[]',1160,'SUP-VAT-1','CASH_ON_HAND','VAT stock',current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  true,'P009999999Z','SUP-VAT-1',current_date) purchase_id;
grant select on pg_temp.vat_purchase to authenticated;
select results_eq(
  $$select gross_total,net_total,input_tax_total,claim_input_vat from public.purchases
    where id=(select purchase_id from vat_purchase)$$,
  $$values (1160::bigint,1000::bigint,160::bigint,true)$$,
  'claimable purchase separates input VAT from net inventory cost');
select is((select b.unit_cost from public.inventory_batches b join public.purchase_lines l
  on l.inventory_batch_id=b.id where l.purchase_id=(select purchase_id from vat_purchase)),100::bigint,
  'inventory batch uses net unit cost after recoverable VAT');
select results_eq(
  $$select a.code::text,sum(l.debit)::bigint,sum(l.credit)::bigint
    from public.ledger_journal_lines l
    join public.ledger_journal_entries e on e.id=l.entry_id
    join public.ledger_accounts a on a.id=l.account_id
    where e.source_type='InventoryPurchase'
      and e.source_id=(select purchase_id::text from vat_purchase)
    group by a.code order by a.code$$,
  $$values ('ACCOUNTS_PAYABLE'::text,0::bigint,1160::bigint),
    ('INVENTORY'::text,1000::bigint,0::bigint),
    ('TAX_PAYABLE'::text,160::bigint,0::bigint)$$,
  'claimable purchase posts net inventory and input VAT in one recognition journal');
select is((select count(*)::integer from public.ledger_journal_entries e
  where e.source_id=(select purchase_id::text from vat_purchase)
    and e.source_type in ('InventoryPurchase','PurchaseVatReclass')),1,
  'new purchases have one recognition journal and no VAT reclassification journal');
select results_eq(
  $$select claim_input_vat,supplier_tax_pin,tax_invoice_number,input_tax_total,
      purchase_posting_version from public.purchase_history
    where id=(select purchase_id from vat_purchase)$$,
  $$values (true,'P009999999Z'::text,'SUP-VAT-1'::text,160::bigint,
    'ap_invoice_v2'::text)$$,
  'purchase history exposes immutable VAT evidence to the detail workspace');
select throws_ok($$select public.record_purchase_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[]',116,'SUP-VAT-1','CASH_ON_HAND',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  true,'P009999999Z','SUP-VAT-1',current_date)$$,
  'P0001','duplicate_supplier_tax_invoice',
  'duplicate supplier tax invoice evidence cannot be claimed twice');

create temp table vat_purchase_expense as select public.record_purchase_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[{"category":"transport","amount":116,"settlement":"supplier_bill"}]',
  232,'SUP-VAT-EXP','CASH_ON_HAND',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  true,'P009999999Z','SUP-VAT-EXP',current_date) purchase_id;
select results_eq(
  $$select p.gross_total,p.net_total,p.input_tax_total,sum(l.debit)::bigint
    from public.purchases p
    join public.ledger_journal_entries e on e.source_type='InventoryPurchase'
      and e.source_id=p.id::text
    join public.ledger_journal_lines l on l.entry_id=e.id
    join public.ledger_accounts a on a.id=l.account_id and a.code='EXPENSES'
    where p.id=(select purchase_id from vat_purchase_expense)
    group by p.id$$,
  $$values (232::bigint,200::bigint,32::bigint,100::bigint)$$,
  'supplier-bill expenses post net expense and recoverable VAT in the consolidated journal');

create temp table vat_purchase_draft as select public.save_purchase_draft_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[]','SUP-VAT-DRAFT',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  'paid',116,'CASH_ON_HAND',null,true,current_date) draft_id;
create temp table vat_purchase_draft_result as select public.confirm_purchase_draft_complete(
  (select draft_id from vat_purchase_draft)) purchase_id;
select results_eq(
  $$select p.claim_input_vat,p.input_tax_total,p.purchase_posting_version
    from public.purchases p where p.id=(select purchase_id from vat_purchase_draft_result)$$,
  $$values (true,16::bigint,'ap_invoice_v2'::text)$$,
  'saved-draft confirmation uses the same tax-aware purchase finalizer');

create temp table vat_exclusive_draft as select public.save_purchase_workspace_draft(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,
    "unit_cost":116,"line_total":116,"value_source":"total",
    "price_entry_basis":"exclusive","entered_value_source":"total",
    "entered_unit_cost":100,"entered_line_total":100}]',
  '[{"category":"transport","amount":116,"settlement":"supplier_bill",
    "price_entry_basis":"exclusive","entered_amount":100}]',
  'SUP-VAT-EXCLUSIVE',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'paid',232,0,'CASH_ON_HAND','vat-exclusive-draft',null,true,current_date
) draft_id;
select is((select price_entry_basis from public.purchase_drafts
  where id=(select draft_id from vat_exclusive_draft)),'exclusive',
  'purchase drafts retain the invoice-wide price entry mode');
create temp table vat_exclusive_result as select public.finalize_purchase_draft(
  (select draft_id from vat_exclusive_draft)) purchase_id;
select results_eq(
  $$select gross_total,net_total,input_tax_total,price_entry_basis,
      (price_entry_payload->>'invoice_tax_total')::bigint
    from public.purchases where id=(select purchase_id from vat_exclusive_result)$$,
  $$values (232::bigint,200::bigint,32::bigint,'exclusive'::text,32::bigint)$$,
  'exclusive entry normalizes to gross while retaining the original invoice tax facts');
select results_eq(
  $$select a.code::text,sum(l.debit)::bigint,sum(l.credit)::bigint
    from public.ledger_journal_lines l
    join public.ledger_journal_entries e on e.id=l.entry_id
    join public.ledger_accounts a on a.id=l.account_id
    where e.source_type='InventoryPurchase'
      and e.source_id=(select purchase_id::text from vat_exclusive_result)
    group by a.code order by a.code$$,
  $$values ('ACCOUNTS_PAYABLE'::text,0::bigint,232::bigint),
    ('EXPENSES'::text,100::bigint,0::bigint),
    ('INVENTORY'::text,100::bigint,0::bigint),
    ('TAX_PAYABLE'::text,32::bigint,0::bigint)$$,
  'exclusive entry uses the existing balanced purchase recognition journal');

create temp table vat_exclusive_nonclaim_draft as select public.save_purchase_workspace_draft(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,
    "unit_cost":116,"line_total":116,"value_source":"total",
    "price_entry_basis":"exclusive","entered_value_source":"total",
    "entered_unit_cost":100,"entered_line_total":100}]',
  '[]','SUP-VAT-EXCLUSIVE-NOCLAIM',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'later',0,0,null,'vat-exclusive-nonclaim',null,false,null
) draft_id;
create temp table vat_exclusive_nonclaim_result as select public.finalize_purchase_draft(
  (select draft_id from vat_exclusive_nonclaim_draft)) purchase_id;
select results_eq(
  $$select p.gross_total,p.net_total,p.input_tax_total,p.invoice_net_total,p.invoice_tax_total,
      p.price_entry_basis,(p.price_entry_payload->>'invoice_tax_total')::bigint,
      l.tax_category_code,l.net_total,l.tax_total,b.original_cost
    from public.purchases p join public.purchase_lines l on l.purchase_id=p.id
    join public.inventory_batches b on b.id=l.inventory_batch_id
    where p.id=(select purchase_id from vat_exclusive_nonclaim_result)$$,
  $$values (116::bigint,116::bigint,0::bigint,100::bigint,16::bigint,'exclusive'::text,
    16::bigint,'STANDARD'::text,100::bigint,16::bigint,116::bigint)$$,
  'unclaimed invoice VAT keeps immutable line facts but remains capitalized into inventory');
select is((select count(*)::integer from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id=l.entry_id
  join public.ledger_accounts a on a.id=l.account_id
  where e.source_type='InventoryPurchase'
    and e.source_id=(select purchase_id::text from vat_exclusive_nonclaim_result)
    and a.code='TAX_PAYABLE'),0,
  'unclaimed invoice VAT never posts to the VAT control account');

create temp table vat_bad_exclusive_draft as select public.save_purchase_workspace_draft(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,
    "unit_cost":115,"line_total":115,"value_source":"total",
    "price_entry_basis":"exclusive","entered_value_source":"total",
    "entered_unit_cost":100,"entered_line_total":100}]',
  '[]','SUP-VAT-BAD-NORMALIZATION',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'later',0,0,null,'vat-bad-exclusive',null,false,null
) draft_id;
select throws_ok(format($$select public.finalize_purchase_draft(%L)$$,
  (select draft_id from vat_bad_exclusive_draft)),
  'P0001','purchase_price_normalization_changed',
  'confirmation rejects browser totals that no longer match the effective tax rate');

create temp table vat_advance_path as select public.record_purchase_with_advance(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[]',0,0,116,'SUP-VAT-ADV','CASH_ON_HAND',null,current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  'vat-advance-path',true,current_date) purchase_id;
select results_eq(
  $$select claim_input_vat,input_tax_total,purchase_posting_version from public.purchases
    where id=(select purchase_id from vat_advance_path)$$,
  $$values (true,16::bigint,'ap_invoice_v2'::text)$$,
  'advance-aware purchase capture uses the same tax-aware purchase finalizer');
create temp table vat_credit_purchase as select public.record_purchase_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[]',0,'SUP-VAT-REV','CASH_ON_HAND','VAT reversal',current_date,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  true,'P009999999Z','SUP-VAT-REV',current_date) purchase_id;
select public.reverse_credit_purchase((select purchase_id from vat_credit_purchase),'Supplier cancelled invoice');
select results_eq(
  $$select p.status,m.total_cost,(public.vat_report(current_date,current_date)->>'input_vat_reversals')::bigint
    from public.purchases p join public.inventory_movements m
      on m.source_type='PurchaseReversal' and m.source_id=p.id::text
    where p.id=(select purchase_id from vat_credit_purchase)$$,
  $$values ('reversed'::text,-100::bigint,16::bigint)$$,
  'credit purchase reversal uses net inventory cost and reports input VAT reversal');

create temp table vat_draft as select public.save_draft_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  null,'[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',null) order_id;
grant select on pg_temp.vat_draft to authenticated;
select results_eq(
  $$select (x->>'gross_total')::bigint,(x->>'net_total')::bigint,(x->>'tax_total')::bigint
    from (select public.estimate_order_tax((select order_id from vat_draft)) x) q$$,
  $$values (116::bigint,100::bigint,16::bigint)$$,
  'proforma receives a non-persisted server tax estimate');
select is((select tax_snapshot_status from public.orders where id=(select order_id from vat_draft)),
  'pending','estimating a draft does not finalize or mutate it');

create temp table vat_sale as select public.post_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  'a1000000-0000-4000-8000-000000000032','[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
  '[{"method":"cash","amount":116}]',false,'vat-sale-1',null,null) result;
grant select on pg_temp.vat_sale to authenticated;
create temp table vat_sale_id as select (result->>'order_id')::uuid order_id from vat_sale;
grant select on pg_temp.vat_sale_id to authenticated;
select results_eq(
  $$select gross_total,net_total,tax_total,tax_snapshot_status from public.orders
    where id=(select order_id from vat_sale_id)$$,
  $$values (116::bigint,100::bigint,16::bigint,'final'::text)$$,
  'completed sale freezes gross, net, and output VAT');
select ok((select tax_document_id is not null from public.orders where id=(select order_id from vat_sale_id)),
  'VAT-registered completed sale receives an immutable VAT document number');
select is((select coalesce(sum(debit),0)-coalesce(sum(credit),0) from public.ledger_journal_lines l
  join public.ledger_journal_entries e on e.id=l.entry_id where e.source_type='VatSaleReclass'
  and e.source_id=(select order_id::text from vat_sale_id)),0::numeric,
  'sale recognition and VAT extraction remain balanced');
select results_eq(
  $$select issuer_tax_registration_number,buyer_tax_registration_number,
      payment_method_codes,payment_breakdown from public.tax_documents
    where source_order_id=(select order_id from vat_sale_id)$$,
  $$values ('P051234567A'::text,'P001234567B'::text,array['cash']::text[],
    '[{"method_code":"cash","amount":116}]'::jsonb)$$,
  'issued VAT document snapshots provider-neutral seller, buyer, and tender facts');
select results_eq(
  $$select unit_price,tax_category_code,tax_classification,tax_rate_bps
    from public.tax_document_lines where tax_document_id=(select tax_document_id
      from public.orders where id=(select order_id from vat_sale_id))$$,
  $$values (116::bigint,'STANDARD'::text,'standard'::text,1600)$$,
  'issued VAT lines snapshot tax facts without freezing provider mappings');
create temp table vat_integration_envelope as select public.tax_document_integration_envelope(
  (select tax_document_id from public.orders where id=(select order_id from vat_sale_id))) envelope;
grant select on pg_temp.vat_integration_envelope to service_role;
select results_eq(
  $$select (envelope->>'ready')::boolean,envelope->>'provider_hint',
      envelope->'buyer'->>'tax_registration_number',jsonb_array_length(envelope->'blockers')
    from vat_integration_envelope$$,
  $$values (true,'KRA_ETIMS'::text,'P001234567B'::text,0)$$,
  'complete snapshots produce a connector-ready provider-neutral envelope');
select public.update_customer_tax_registration(
  'a1000000-0000-4000-8000-000000000032','P009999999X');
select public.update_location_tax_branch_code(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'99');
select public.upsert_tax_integration_item_mapping(
  'a1000000-0000-4000-8000-000000000020',
  (select id from public.tax_jurisdictions where country_code='KE'),'KRA_ETIMS',
  'KE-ITEM-NEW','14111501','1','KE','NT','U','{}');
select results_eq(
  $$select envelope->'buyer'->>'tax_registration_number',
      envelope->'location'->>'branch_code',envelope->'lines'->0->>'external_item_code'
    from (select public.tax_document_integration_envelope(
      (select tax_document_id from public.orders where id=(select order_id from vat_sale_id)),
      'KRA_ETIMS') envelope) current_export$$,
  $$values ('P001234567B'::text,'99'::text,'KE-ITEM-NEW'::text)$$,
  'provider mappings resolve at export time while immutable document identity stays unchanged');
reset role;
select throws_ok(format('update public.orders set tax_total=15 where id=%L',
  (select order_id from vat_sale_id)),'P0001','final_tax_snapshot_immutable',
  'completed sale tax snapshots cannot be rewritten');
select throws_ok(format('update public.tax_documents set gross_total=115 where source_order_id=%L',
  (select order_id from vat_sale_id)),'P0001','tax_document_immutable',
  'issued VAT document fiscal fields cannot be rewritten');
select throws_ok(format($$update public.tax_document_lines set gross_total=115
  where tax_document_id=(select tax_document_id from public.orders where id=%L)$$,
  (select order_id from vat_sale_id)),'P0001','tax_document_line_immutable',
  'issued VAT document lines cannot be rewritten');
set local role service_role;
create temp table vat_submission as select public.queue_tax_document_submission(
  (select (envelope->'document'->>'id')::uuid from vat_integration_envelope),
  'KRA_ETIMS',1,(select envelope from vat_integration_envelope)) submission_id;
select ok((select submission_id is not null from vat_submission),
  'a connector can durably queue the exact prepared payload');
select throws_ok(format($$update public.tax_export_artifacts set request_payload='{"changed":true}'
    where id=(select artifact_id from public.tax_submission_jobs where id=%L)$$,
  (select submission_id from vat_submission)),'P0001','tax_export_artifact_immutable',
  'frozen connector artifacts cannot be rewritten while job state remains mutable');
reset role;
select testkit.as_user((select company_id from vat_fixture),
  'a1000000-0000-4000-8000-000000000001','Admin');

create temp table vat_offline_open as select public.post_offline_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),null,
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
  '[{"method":"cash","amount":116}]','vat-offline-open-1',
  (current_date-1)::timestamp at time zone 'Africa/Nairobi','vat-open-device',1,null) result;
select ok((select bool_and(e.entry_date=current_date-1)
  from public.ledger_journal_entries e
  where e.source_type in ('Payment','InventorySaleCogs','VatSaleReclass')
    and exists(select 1 from public.ledger_journal_lines l where l.entry_id=e.id
      and l.order_id=(select (result->>'order_id')::uuid from vat_offline_open))),
  'open-period offline sale posts every journal on its occurred date');
select set_config('app.sale_tax_point','',true);
select set_config('app.sale_journal_date','',true);

create temp table mixed_sale as select public.post_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  null,'[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_price":116},{"variant_id":"a1000000-0000-4000-8000-000000000021","quantity":1,"unit_price":50},{"variant_id":"a1000000-0000-4000-8000-000000000022","quantity":1,"unit_price":50}]',
  '[{"method":"cash","amount":216}]',false,'vat-mixed-1',null,null) result;
grant select on pg_temp.mixed_sale to authenticated;
create temp table mixed_sale_id as select (result->>'order_id')::uuid order_id from mixed_sale;
grant select on pg_temp.mixed_sale_id to authenticated;
select results_eq(
  $$select gross_total,net_total,tax_total from public.orders where id=(select order_id from mixed_sale_id)$$,
  $$values (216::bigint,200::bigint,16::bigint)$$,
  'mixed standard, zero-rated, and exempt lines reconcile exactly to gross');
select set_eq(
  $$select tax_classification from public.order_lines where order_id=(select order_id from mixed_sale_id)$$,
  $$values ('standard'::text),('zero_rated'::text),('exempt'::text)$$,
  'zero-rated and exempt remain distinct classifications');

reset role;
update public.orders set status='voided' where id=(select order_id from mixed_sale_id);
select throws_ok(format('update public.orders set tax_total=0 where id=%L',
  (select order_id from mixed_sale_id)),'P0001','final_tax_snapshot_immutable',
  'voided sale tax snapshots remain immutable');
select testkit.as_user((select company_id from vat_fixture),
  'a1000000-0000-4000-8000-000000000001','Admin');
select is((public.vat_report(current_date,current_date)->>'void_vat')::bigint,16::bigint,
  'current VAT report includes output VAT reversed by a void');

reset role;
insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
select 'a1000000-0000-4000-8000-000000000031',company_id,'Credit customer',true,10000
from vat_fixture;
select testkit.as_user((select company_id from vat_fixture),
  'a1000000-0000-4000-8000-000000000001','Admin');
create temp table vat_credit_sale as select public.post_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture)
    and is_default limit 1),'a1000000-0000-4000-8000-000000000031',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000021","quantity":1,"unit_price":50}]',
  '[]',false,'vat-credit-sale-1',null,null) result;
create temp table vat_credit_note as select public.post_full_refund(
  (select (result->>'order_id')::uuid from vat_credit_sale),
  'cash','Cancel unpaid credit sale','write_off') result;
select is((select result->>'status' from vat_credit_note),'completed',
  'unpaid credit sale accepts a full credit note');
select is((select sum(l.credit)::bigint from public.ledger_journal_lines l
  join public.ledger_accounts a on a.id=l.account_id
  join public.ledger_journal_entries e on e.id=l.entry_id
  where e.source_type='Refund' and a.code='ACCOUNTS_RECEIVABLE'
    and l.order_id=(select (result->>'order_id')::uuid from vat_credit_sale)),50::bigint,
  'unpaid portion of a credit note credits receivables instead of cash');

create temp table vat_refund as select public.post_full_refund((select order_id from vat_sale_id),
  'cash','Customer returned the item','return_to_stock') result;
grant select on pg_temp.vat_refund to authenticated;
select is((select result->>'status' from vat_refund),'completed','authorized full refund posts immediately');
select results_eq(
  $$select gross_total,net_total,tax_total,stock_outcome from public.refunds
    where order_id=(select order_id from vat_sale_id)$$,
  $$values (116::bigint,100::bigint,16::bigint,'return_to_stock'::text)$$,
  'credit note copies original line-level tax and records the stock outcome');
select ok((select tax_document_id is not null from public.refunds
  where order_id=(select order_id from vat_sale_id)),'VAT refund receives a linked credit-note document');
select results_eq(
  $$select credit.tax_category_code,credit.tax_classification,credit.tax_rate_bps,
      document.buyer_tax_registration_number,
      document.original_document_id=(select tax_document_id from public.orders
        where id=(select order_id from vat_sale_id))
    from public.refunds r
    join public.tax_documents document on document.id=r.tax_document_id
    join public.tax_document_lines credit on credit.tax_document_id=r.tax_document_id
    where r.order_id=(select order_id from vat_sale_id)$$,
  $$values ('STANDARD'::text,'standard'::text,1600,'P001234567B'::text,true)$$,
  'credit notes copy original tax facts and reference the original document');
select ok((select count(*)>0 from public.inventory_movements where source_type='RefundRestock'
  and source_id=(select id::text from public.refunds
    where order_id=(select order_id from vat_sale_id))),
  'return-to-stock refund restores inventory through auditable movements');
select throws_ok($$select public.post_full_refund((select order_id from vat_sale_id),
  'cash','Retry','return_to_stock')$$,'P0001','sale_already_refunded',
  'a sale cannot receive a second full credit note');

reset role;
update public.accounting_periods set start_date=current_date-1,end_date=current_date-1,
  status='closed',closed_at=now(),closed_by='a1000000-0000-4000-8000-000000000001'
where company_id=(select company_id from vat_fixture) and status='open';
insert into public.period_locks(company_id,lock_end_date,updated_at)
select company_id,current_date-1,now()-interval '1 day' from vat_fixture
on conflict(company_id) do update set lock_end_date=excluded.lock_end_date,updated_at=excluded.updated_at;
insert into public.accounting_periods(company_id,start_date,end_date,status,created_by)
select company_id,current_date,current_date,'open','a1000000-0000-4000-8000-000000000001' from vat_fixture;
select testkit.as_user((select company_id from vat_fixture),
  'a1000000-0000-4000-8000-000000000001','Admin');

create temp table late_result as select public.post_offline_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  null,'[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_price":116}]',
  '[{"method":"cash","amount":116}]','vat-late-1',now()-interval '1 day','vat-test-device',1,null) result;
grant select on pg_temp.late_result to authenticated;
select is((select result->>'status' from late_result),'late_review_required',
  'offline sale in a locked period is parked for review instead of back-posted');
select throws_ok($$select public.post_offline_sale_at_location(
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  null,'[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_price":115}]',
  '[{"method":"cash","amount":115}]','vat-late-1',now()-interval '1 day','vat-test-device',1,null)$$,
  'P0001','idempotency_conflict: client_ref reused with different late-sale payload',
  'late-sale idempotency rejects a reused client reference with different economics');
create temp table late_review_result as select public.review_late_sale(
  (select (result->>'review_id')::uuid from late_result),true,'Verified device timestamp') result;
grant select on pg_temp.late_review_result to authenticated;
select is((select status from public.late_sale_reviews where client_ref='vat-late-1'),'approved',
  'dual-permission manager can approve a late offline sale');
select is((select public.order_vat_reporting_date(o.id,o.tax_point_at,'Africa/Nairobi')
  from public.orders o join public.late_sale_reviews l on l.posted_order_id=o.id
  where l.client_ref='vat-late-1'),current_date-1,
  'approved late sale keeps VAT on its immutable transaction tax point');
select is((select jsonb_array_length(public.vat_report(current_date,current_date)->'late_transactions')),1,
  'current VAT report includes a prior-period correction schedule');
create temp table late_vat_purchase as select public.record_purchase_complete_with_tax(
  'a1000000-0000-4000-8000-000000000030',
  '[{"variant_id":"a1000000-0000-4000-8000-000000000020","quantity":1,"unit_cost":116,"line_total":116,"value_source":"unit"}]',
  '[]',116,'SUP-VAT-LATE','CASH_ON_HAND',null,current_date-1,
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),
  true,'P009999999Z','SUP-VAT-LATE',current_date-1) purchase_id;
select results_eq(
  $$select (p.tax_point_at at time zone 'Africa/Nairobi')::date,
      p.accounting_posting_date,p.is_late_tax_adjustment,
      jsonb_array_length(public.vat_report(current_date,current_date)->'late_transactions')
    from public.purchases p where p.id=(select purchase_id from late_vat_purchase)$$,
  $$values (current_date-1,current_date,true,2)$$,
  'closed-period supplier invoice keeps its tax point, posts now, and joins the correction schedule');
select public.pos_device_heartbeat('vat-test-device',
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),0,true);
create temp table retired_device as select public.pos_device_heartbeat('vat-retired-device',
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),0,true) id;
select public.retire_pos_device((select id from retired_device),'Lost device');
select throws_ok($$select public.pos_device_heartbeat('vat-retired-device',
  (select id from public.stock_locations where company_id=(select company_id from vat_fixture) and is_default limit 1),0,true)$$,
  'P0001','device_retired','retired devices cannot reactivate themselves');

reset role;
update public.cashier_sessions set status='closed',closed_at=now()
where company_id=(select company_id from vat_fixture) and status='open';
update public.payment_methods set requires_reconciliation=false
where company_id=(select company_id from vat_fixture);
update public.location_payment_methods set requires_reconciliation=false
where company_id=(select company_id from vat_fixture);
update public.pos_devices set last_seen_at=now()-interval '2 days',pending_count=0
where company_id=(select company_id from vat_fixture);
insert into public.daily_business_closes(company_id,business_date,status,summary,signed_off_by)
select company_id,current_date,'signed_off','{}',
  'a1000000-0000-4000-8000-000000000001' from vat_fixture;
select testkit.as_user((select company_id from vat_fixture),
  'a1000000-0000-4000-8000-000000000001','Admin');

select is((public.period_close_readiness(current_date)->'blockers')::text,'{}',
  'monthly readiness has no blockers after sessions, queues, reviews, and sign-offs are clear');
select is((public.period_close_readiness(current_date)->'warnings'->>'stale_devices')::integer,2,
  'stale devices warn without blocking a known-clear queue');
create temp table closed_vat_period as select public.close_accounting_period(current_date) period_id;
grant select on pg_temp.closed_vat_period to authenticated;
select is((select p.accounting_period_id from public.purchases p
    where p.id=(select purchase_id from late_vat_purchase)),
  (select period_id from closed_vat_period),
  'period close preserves the posting-period identity referenced by transactions');
select is((select count(*)::integer from public.accounting_periods
  where company_id=(select company_id from vat_fixture) and status='open'),1,
  'closing atomically creates exactly one next open period');
select ok((select count(*)=1 from public.period_closing_packs
  where accounting_period_id=(select period_id from closed_vat_period)),
  'monthly close captures one immutable final reporting pack');

reset role;
select throws_ok(format('update public.period_closing_packs set snapshot=''{"changed":true}'' where accounting_period_id=%L',
  (select period_id from closed_vat_period)),'P0001','period_closing_pack_immutable',
  'closed reporting pack cannot be edited');

select * from finish();
rollback;
