begin;
set local timezone to 'UTC';
select no_plan();
select testkit.create_user('a1370000-0000-4000-8000-000000000001','offline-custody@test.local');
create temp table vat_boundary_fixture as select testkit.provision(
  'a1370000-0000-4000-8000-000000000001','Offline custody') company_id;
grant select on vat_boundary_fixture to authenticated;
insert into public.products(id,company_id,name)
select 'a1370000-0000-4000-8000-000000000010',company_id,'Boundary service' from vat_boundary_fixture;
insert into public.product_variants(id,product_id,company_id,name,sku,kind,price,wholesale_price,track_inventory)
select 'a1370000-0000-4000-8000-000000000020','a1370000-0000-4000-8000-000000000010',
  company_id,'Default','OFFLINE-CUSTODY','service',116,116,false from vat_boundary_fixture;
create function pg_temp.change_vat(enabled boolean,starts date default null)
returns uuid language sql as $$
  select public.schedule_company_tax_profile(j.id,enabled,'',starts,c.id)
  from public.tax_jurisdictions j join public.tax_categories c on c.jurisdiction_id=j.id
  where j.country_code='KE' and c.code='STANDARD'
$$;
select testkit.as_user((select company_id from vat_boundary_fixture),
  'a1370000-0000-4000-8000-000000000001','Admin');
select testkit.ensure_open_session();

create temp table offline_location as select id from public.stock_locations
 where company_id=(select company_id from vat_boundary_fixture) and is_default;
create temp table offline_context as select public.confirm_offline_sale_context(
 (select id from offline_location),'offline-fixture-device') data;
reset role;
create temp table offline_payload as select jsonb_build_object(
 'protocol_version',2,'client_ref','offline-fresh','location_id',(select id from offline_location),'customer_id',null,
 'offline_context_id',(select data#>>'{context,id}' from offline_context),
 'originating_session_id',(select data#>>'{session,id}' from offline_context),
 'occurred_at',clock_timestamp(),'device_key','offline-fixture-device',
 'lines',jsonb_build_array(jsonb_build_object('variant_id','a1370000-0000-4000-8000-000000000020',
  'quantity',1,'unit_price',116,'expected_unit_price',116,'units_per_unit',1,'price_source','retail',
  'capture',public.offline_line_current_state((select company_id from vat_boundary_fixture),
   '{"variant_id":"a1370000-0000-4000-8000-000000000020","quantity":1,"price_source":"retail"}'))),
 'payments','[{"method":"cash","amount":116}]'::jsonb) data;
grant select on offline_payload,offline_context,offline_location to authenticated;
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
create temp table offline_result as select public.submit_offline_sale((select data from offline_payload)) data;
select is((select data->>'status' from offline_result),'completed','fresh evidenced sale posts');
select is(public.submit_offline_sale((select data from offline_payload)),(select data from offline_result),
 'identical lost-response replay returns its original result');
select throws_ok($sql$select public.submit_offline_sale((select jsonb_set(data,'{payments,0,amount}','117')
 from offline_payload))$sql$,'P0001','idempotency_conflict: original offline request is immutable',
 'changed-payment retries cannot reuse the original reference');

-- Metadata is audit evidence, not a replacement lookup key or price conflict.
reset role;
update public.products set name='Renamed service' where id='a1370000-0000-4000-8000-000000000010';
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
select is(public.submit_offline_sale((select data||'{"client_ref":"offline-renamed"}' from offline_payload))->>'status',
 'completed','metadata-only changes keep stable IDs and can post');
reset role;
update public.product_variants set price=140 where id='a1370000-0000-4000-8000-000000000020';
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
create temp table offline_price as select public.submit_offline_sale(
 (select data||'{"client_ref":"offline-price"}' from offline_payload)) data;
select is((select data->>'status' from offline_price),'review','a changed catalogue price holds the whole sale');
select ok((select data->'blockers' @> '[{"code":"item_conflict","reasons":["item_price_changed"]}]'
 from offline_price),'the hold explains the captured/current price conflict');
reset role;
create temp table offline_proposed as select jsonb_set(data||'{"client_ref":"offline-price"}', '{lines,0}',
 data#>'{lines,0}'||jsonb_build_object('expected_unit_price',140,'custom_price',116,
 'override_reason','Honour captured price','capture',public.offline_line_current_state(
 (select company_id from vat_boundary_fixture),data#>'{lines,0}'))) data from offline_payload;
grant select on offline_proposed to authenticated;
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
create temp table offline_price_review as select public.get_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_price),(select (data#>>'{session,id}')::uuid from offline_context),
 (select data from offline_proposed)) data;
reset role;
update public.product_variants set price=150 where id='a1370000-0000-4000-8000-000000000020';
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
select is(public.confirm_offline_sale_review((select (data->>'review_id')::uuid from offline_price),
 'a1370000-0000-4000-8000-000000000090',(select data->>'review_fingerprint' from offline_price_review),
 (select (data#>>'{session,id}')::uuid from offline_context),'Honour captured price',
 (select data from offline_proposed))->'blockers','[{"code":"review_changed"}]'::jsonb,
 'a catalogue change after review invalidates confirmation');
reset role;
update offline_proposed set data=jsonb_set(data,'{lines,0}',data#>'{lines,0}'||
 jsonb_build_object('expected_unit_price',150,'capture',public.offline_line_current_state(
 (select company_id from vat_boundary_fixture),data#>'{lines,0}')));
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
update offline_price_review set data=public.get_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_price),(select (data#>>'{session,id}')::uuid from offline_context),
 (select data from offline_proposed));
create temp table offline_corrected as select public.confirm_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_price),'a1370000-0000-4000-8000-000000000091',
 (select data->>'review_fingerprint' from offline_price_review),
 (select (data#>>'{session,id}')::uuid from offline_context),'Honour captured price',
 (select data from offline_proposed)) data;
select is((select data->>'status' from offline_corrected),'completed','an authorized captured-price correction posts');
select is(public.confirm_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_price),'a1370000-0000-4000-8000-000000000091',
 (select data->>'review_fingerprint' from offline_price_review),
 (select (data#>>'{session,id}')::uuid from offline_context),'Honour captured price',
 (select data from offline_proposed)),(select data from offline_corrected),'duplicate confirmation returns its original result');
select is(public.post_sale(null,(select data->'lines' from offline_payload),
 '[{"method":"cash","amount":116}]',false,'offline-price'),
 (select (data->>'order_id')::uuid from offline_corrected),'a delayed original attempt returns the completed correction');
select is((select count(*)::integer from public.payments where order_id=(select (data->>'order_id')::uuid from offline_corrected)),
 1,'original and corrected attempts collect payment once');

-- The sale was captured before closing, but was unknown to the server until now.
reset role;
update public.product_variants set price=116 where id='a1370000-0000-4000-8000-000000000020';
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
select public.close_cashier_session((select (data#>>'{session,id}')::uuid from offline_context),
 (select jsonb_agg(jsonb_build_object('account_code',b.account_code,
  'declared',b.expected_balance+case when b.account_code='CASH_ON_HAND' then 116 else 0 end))
 from public.cashier_expected_balances((select id from offline_location),
  (select (data#>>'{session,id}')::uuid from offline_context)) b));
create temp table offline_next_session as select testkit.ensure_open_session() id;
create temp table offline_crossover as select public.submit_offline_sale(
 (select data||'{"client_ref":"offline-crossover"}' from offline_payload)) data;
select is((select data->>'status' from offline_crossover),'waiting','closed origin never silently changes session');
create temp table offline_crossover_review as select public.get_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_crossover),(select id from offline_next_session)) data;
select throws_ok($sql$select public.confirm_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_crossover),'a1370000-0000-4000-8000-000000000092',
 (select data->>'review_fingerprint' from offline_crossover_review),(select id from offline_next_session),
 'Move reviewed sale')$sql$,'P0001','session_crossover_confirmation_required','crossover needs explicit confirmation');
select throws_ok($sql$select public.confirm_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_crossover),'a1370000-0000-4000-8000-000000000092',
 (select data->>'review_fingerprint' from offline_crossover_review),(select id from offline_next_session),
 'Move reviewed sale',null,true)$sql$,'P0001','late_cash_resolution_required','late cash stays held until its closing-count treatment is resolved');
create temp table offline_closing_count as select id,declared_cash from public.cash_drawer_counts
 where session_id=(select (data#>>'{session,id}')::uuid from offline_context) and count_type='closing';
reset role;
create temp table offline_cash_before as select public.location_account_balance(
 (select company_id from vat_boundary_fixture),(select id from offline_location),'CASH_ON_HAND') amount;
grant select on offline_cash_before to authenticated;
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
create temp table offline_crossed as select public.confirm_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_crossover),'a1370000-0000-4000-8000-000000000092',
 (select data->>'review_fingerprint' from offline_crossover_review),(select id from offline_next_session),
 'Move reviewed sale',null,true,jsonb_build_object('included_amount',116,
 'closing_count_id',(select id from offline_closing_count),'reason','Cash included in original closing count')) data;
select is((select data->>'status' from offline_crossed),'completed','authorized crossover and cash correction commit together');
reset role;
select is(public.location_account_balance((select company_id from vat_boundary_fixture),
 (select id from offline_location),'CASH_ON_HAND'),(select amount from offline_cash_before),
 'previously counted cash is not counted a second time when the sale posts');
select is((select declared_cash from public.cash_drawer_counts where id=(select id from offline_closing_count)),
 (select declared_cash from offline_closing_count),'the original closing count remains unchanged');
select is((select cashier_session_id from public.orders where id=(select (data->>'order_id')::uuid from offline_crossed)),
 (select id from offline_next_session),'posting uses the exact confirmed destination session');

select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
-- A hard cutover rejects legacy queues without creating recovery obligations.
select throws_ok($sql$select public.post_offline_sale_at_location(
 (select id from offline_location),null,(select data->'lines' from offline_payload),
 '[{"method":"cash","amount":116}]','offline-legacy',now(),'old-device',1)$sql$,
 'P0001','offline_client_update_required: old queued sales are no longer accepted; update the app',
 'legacy sale replay is rejected at the server boundary');
select throws_ok($sql$select public.post_offline_fulfillment_sale_at_location(
 (select id from offline_location),'{"phone":"0712345678","first_name":"Sample"}',
 (select data->'lines' from offline_payload),'[{"method":"cash","amount":116}]',
 '{"fulfillment_type":"delivery","phone":"0712345678","address":"Old address"}',
 'offline-legacy-delivery',now()-interval '2 days','old-device',1)$sql$,
 'P0001','offline_client_update_required: old queued sales are no longer accepted; update the app',
 'legacy fulfillment replay is also rejected');
select throws_ok($sql$select public.submit_offline_sale((select data-'protocol_version' from offline_payload))$sql$,
 'P0001','offline_client_update_required: old queued sales are no longer accepted; update the app',
 'legacy requests cannot bypass the cutover through the new endpoint');
reset role;
select is((select count(*)::integer from public.offline_sale_requests where client_ref like 'offline-legacy%'),
 0,'rejected old queues create no server custody or session obligations');

-- New-version queues still retain complete fulfillment/payment evidence on hold.
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000001','Admin');
create temp table offline_held as select public.submit_offline_sale((select data||jsonb_build_object(
 'client_ref','offline-new-held','originating_session_id',(select id from offline_next_session),
 'occurred_at',now()-interval '2 days','fulfillment',jsonb_build_object(
 'fulfillment_type','delivery','phone','0712345678','address','Retain this address')) from offline_payload)) data;
select is((select data->>'status' from offline_held),'review','old new-contract sales remain held for review');
select ok((select (data->>'durable_custody')::boolean from offline_held),'new review acknowledges durable custody');
select is(public.get_offline_sale_review((select (data->>'review_id')::uuid from offline_held))
 #>>'{original_request,fulfillment,address}','Retain this address','fulfillment payload survives a review hold');
select throws_ok('select testkit.close_open_session()','P0001',
 'unresolved_offline_sales: resolve pending sales before closing this session',
 'known new-contract obligations block closing');

select throws_ok($sql$select public.review_late_sale(gen_random_uuid(),true,'Old approval')$sql$,
 'P0001','offline_client_update_required: old queued sales are no longer accepted; update the app',
 'the old review endpoint cannot revive pre-cutover queues');

-- Boundaries and evidence are independent blockers, all retained together.
create temp table offline_context_two as select public.confirm_offline_sale_context(
 (select id from offline_location),'offline-fixture-device') data;
create temp table offline_fresh_two as select data||jsonb_build_object(
 'offline_context_id',(select data#>>'{context,id}' from offline_context_two),
 'originating_session_id',(select id from offline_next_session),'occurred_at',clock_timestamp()) data from offline_payload;
select ok(public.submit_offline_sale((select data||jsonb_build_object('client_ref','offline-24h',
 'occurred_at',clock_timestamp()-interval '24 hours') from offline_fresh_two))->'blockers'
 @> '[{"code":"capture_age_review"}]','the exact 24-hour boundary requires review');
select ok(public.submit_offline_sale((select data||jsonb_build_object('client_ref','offline-future',
 'occurred_at',clock_timestamp()+interval '5 minutes') from offline_fresh_two))->'blockers'
 @> '[{"code":"capture_age_review"}]','a future capture cannot bypass review');
select ok(public.submit_offline_sale((select jsonb_set(data||'{"client_ref":"offline-no-evidence"}',
 '{lines,0,capture}','null') from offline_fresh_two))->'blockers'
 @> '[{"code":"item_conflict","reasons":["item_evidence_required"]}]','missing item evidence is held');
select ok(public.submit_offline_sale((select jsonb_set(jsonb_set(data||'{"client_ref":"offline-fraction"}',
 '{lines,0,quantity}','0.5'),'{payments,0,amount}','58') from offline_fresh_two))->'blockers'
 @> '[{"code":"item_conflict","reasons":["invalid_quantity"]}]','fractional quantity restrictions are revalidated');
reset role;
insert into public.offline_sale_contexts(company_id,user_id,location_id,session_id,device_key,issued_at,expires_at)
select company_id,'a1370000-0000-4000-8000-000000000001',(select id from offline_location),
 (select id from offline_next_session),'expired-device',statement_timestamp()-interval '25 hours',statement_timestamp()-interval '1 hour'
from vat_boundary_fixture;
create temp table offline_expired_context as select id from public.offline_sale_contexts where device_key='expired-device';
grant select on offline_fresh_two,offline_expired_context to authenticated;
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000001','Admin');
select ok(public.submit_offline_sale((select data||jsonb_build_object('client_ref','offline-expired',
 'offline_context_id',(select id from offline_expired_context),'device_key','expired-device',
 'occurred_at',clock_timestamp()-interval '2 hours') from offline_fresh_two))->'blockers'
 @> '[{"code":"offline_context_review"}]','an expired context holds even a sale younger than 24 hours');
reset role;
update public.product_variants set wholesale_price=110 where id='a1370000-0000-4000-8000-000000000020';
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000001','Admin');
select ok(public.submit_offline_sale((select data||'{"client_ref":"offline-floor"}' from offline_fresh_two))->'blockers'
 @> '[{"code":"item_conflict","reasons":["item_price_changed"]}]','a changed floor is a conflict even when the selling price is unchanged');
reset role;
update public.product_variants set wholesale_price=116,active=false where id='a1370000-0000-4000-8000-000000000020';
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000001','Admin');
select ok(public.submit_offline_sale((select data||'{"client_ref":"offline-archived"}' from offline_fresh_two))->'blockers'
 @> '[{"code":"item_conflict","reasons":["item_unavailable"]}]','an archived item remains held without replacement lookup');
reset role;
update public.product_variants set active=true,kind='good',track_inventory=true where id='a1370000-0000-4000-8000-000000000020';
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000001','Admin');
create temp table offline_structural as select public.submit_offline_sale((select data||'{"client_ref":"offline-structure"}' from offline_fresh_two)) data;
select ok((select data->'blockers' @> '[{"code":"item_conflict","reasons":["item_structure_changed","insufficient_stock"]}]'
 from offline_structural),'structural and stock blockers are shown together');
select throws_ok($sql$select public.cancel_offline_sale((select (data->>'review_id')::uuid from offline_structural),
 'Cancel with payment returned','{}')$sql$,'P0001',
 'payment_resolution_required: record the payment return before cancellation','paid sales cannot be discarded without payment resolution');
select is(public.cancel_offline_sale((select (data->>'review_id')::uuid from offline_structural),
 'Returned cash to customer','{"action":"payment_returned","reference":"REFUND-137","included_in_closing_count":0}')->>'status',
 'cancelled','an authorized payment resolution cancels a held sale');
select is(public.submit_offline_sale((select data||'{"client_ref":"offline-structure"}' from offline_fresh_two))->>'status',
 'cancelled','retry cannot revive a cancelled sale');
reset role;
select is((select count(*)::integer from public.offline_sale_events where request_id=(select (data->>'review_id')::uuid from offline_structural)
 and action='cancelled_after_resolution'),1,'the cancellation keeps one durable audit event');
select throws_ok($sql$update public.offline_sale_requests set original_request='{}' where client_ref='offline-structure'$sql$,
 'P0001','offline_evidence_immutable','corrections cannot overwrite captured evidence');
select throws_ok($sql$update public.orders set captured_at=clock_timestamp() where id=(select (data->>'order_id')::uuid from offline_corrected)$sql$,
 'P0001','sale_capture_time_immutable','capture timestamps remain immutable after completion');

-- A denied unposted attempt is not a completed (then voided) sale.
reset role;
update public.product_variants set kind='service',track_inventory=false
 where id='a1370000-0000-4000-8000-000000000020';
select testkit.create_user('a1370000-0000-4000-8000-000000000002','offline-cashier@test.local');
select testkit.add_member((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000002','Offline cashier',array['SettleOrder','OverridePrice']);
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000002','Offline cashier');
create temp table offline_approval_payload as select testkit.offline_request(
 (select id from offline_location),null,
 '[{"variant_id":"a1370000-0000-4000-8000-000000000020","quantity":1,"unit_price":116,"custom_price":100,"override_reason":"Honour captured offer"}]',
 '[{"method":"cash","amount":100}]','offline-below-floor',clock_timestamp(),'cashier-approval-device') data;
create temp table offline_approval_result as select public.submit_offline_sale((select data from offline_approval_payload)) data;
select is((select data->>'status' from offline_approval_result),'approval','below-floor captured prices retain the normal approval requirement');
reset role;
select throws_ok($sql$update public.order_lines set quantity=2 where order_id=(select id from public.orders
 where offline_request_id=(select (data->>'review_id')::uuid from offline_approval_result) and status='draft')$sql$,
 'P0001','offline_order_immutable: use a review revision','pending approval lines cannot be edited outside a reviewed correction');
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000001','Admin');
select public.deny_request((select (data#>>'{blockers,0,approval_id}')::uuid from offline_approval_result),'Review a correction');
select is(public.submit_offline_sale((select data from offline_approval_payload))->>'status','review',
 'a declined unposted approval returns to review instead of becoming completed');
create temp table offline_after_denial as select public.get_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_approval_result)) data;
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000002','Offline cashier');
create temp table offline_retry_denied as select public.confirm_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_approval_result),gen_random_uuid(),
 (select data->>'review_fingerprint' from offline_after_denial),
 (select (data#>>'{destination_session,id}')::uuid from offline_after_denial),
 'Authorized correction after declined attempt') data;
select is((select data->>'status' from offline_retry_denied),'approval',
 'a corrected below-floor sale still requires its own price approval');
select testkit.as_user((select company_id from vat_boundary_fixture),'a1370000-0000-4000-8000-000000000001','Admin');
select public.approve_request((select (data#>>'{blockers,0,approval_id}')::uuid from offline_retry_denied),'Approve reviewed price');
-- Another authorized device can recover entirely from server custody, including
-- the active correction, without reconstructing a queue or requesting approval again.
reset role;
select testkit.create_user('a1370000-0000-4000-8000-000000000003','offline-peer@test.local');
select testkit.add_member((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000003','Offline peer',array['SettleOrder','OverridePrice']);
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000003','Offline peer');
create temp table offline_peer_review as select public.get_offline_sale_review(
 (select (data->>'review_id')::uuid from offline_retry_denied)) data;
update offline_retry_denied set data=public.submit_offline_sale(
 (select data->'original_request' from offline_peer_review));
select is((select data->>'status' from offline_retry_denied),'completed',
 'an approved correction posts after the unposted attempt was voided');
select is((select count(*)::integer from public.payments where order_id=(select (data->>'order_id')::uuid from offline_retry_denied)),
 1,'the corrected approval attempt records its collected payment once');
reset role;
select is((select count(*)::integer from public.orders where offline_request_id=(select (data->>'review_id')::uuid from offline_approval_result)
 and status='voided' and posted_at is null),1,'the declined attempt remains separately auditable');
select ok((select posting_request_fingerprint is not null from public.orders
 where id=(select (data->>'order_id')::uuid from offline_retry_denied)),
 'the completed correction retains its full posting fingerprint');
select is((select count(*)::integer from public.offline_sale_revisions
 where request_id=(select (data->>'review_id')::uuid from offline_retry_denied)),1,
 'cross-device resume reuses the approved revision');
select is((select count(*)::integer from public.approvals a join public.orders o
 on a.metadata->>'order_id'=o.id::text where o.offline_request_id=
 (select (data->>'review_id')::uuid from offline_retry_denied)),2,
 'cross-device resume creates no additional approval beyond the denied and approved attempts');

-- Money screens share session visibility without gaining sale authorization.
select testkit.create_user('a1370000-0000-4000-8000-000000000004','offline-finance@test.local');
select testkit.add_member((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000004','Expense recorder',array['CreateInterAccountTransfer','ViewFinancials']);
select testkit.as_user((select company_id from vat_boundary_fixture),
 'a1370000-0000-4000-8000-000000000004','Expense recorder');
create temp table offline_financial_session as select public.confirm_offline_sale_context(
 (select id from offline_location),'finance-device') data;
select is((select data#>>'{session,status}' from offline_financial_session),'open',
 'financial users can confirm an open session without SettleOrder');
select is((select data->'context' from offline_financial_session),'null'::jsonb,
 'financial session visibility does not grant offline capture');
select lives_ok($sql$select public.post_expense_with_tax(10,'CASH_ON_HAND')$sql$,
 'the existing financial permission still authorizes expense posting');
select throws_ok($sql$select public.submit_offline_sale((select data from offline_payload))$sql$,
 'P0001','permission_denied: SettleOrder required','session visibility does not authorize sale submission');
select throws_ok($sql$select public.confirm_offline_sale_context(gen_random_uuid(),'finance-device')$sql$,
 'P0001','location_access_denied','session visibility remains location-scoped');
reset role;
select is((select count(*)::integer from public.offline_sale_contexts
 where user_id='a1370000-0000-4000-8000-000000000004'),0,
 'read-only financial session checks persist no sale context');

select * from finish();
rollback;
