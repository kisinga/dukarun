-- LOCAL DEVELOPMENT ONLY. Run after seed.sql; never run against a hosted database.
-- Additive, transactional and repeatable: UX-* SKUs / list-ux-v1 references own
-- these fixtures. Existing walkthrough products, balances and user records stay
-- untouched. Dates are relative to the first hydration, not moved on every run.
begin;
select pg_advisory_xact_lock(hashtext('dukarun-local-list-ux-v1'));

do $$
declare
  c uuid; main uuid; warehouse uuid; branch uuid;
  admin constant uuid := '5877ac73-ff8d-457c-afcd-791e66229d17';
  staff uuid; product uuid; variant uuid; party uuid; sale uuid; purchase uuid;
  session_id uuid; plan_id uuid; period_id uuid; fulfillment uuid; entry uuid; loc uuid;
  claims text := current_setting('request.jwt.claims', true);
  i integer; j integer; idx integer; cost bigint; price bigint; qty numeric;
  lines jsonb; payments jsonb; declarations jsonb; result jsonb;
  at_time timestamptz; ref text; target numeric; current_qty numeric;
  names text[] := array['Pishori rice','Cooking oil','Breakfast tea','Laundry soap',
    'Tomato paste','Wholegrain maize flour','Peanut butter','Long-life milk',
    'Red kidney beans','Drinking chocolate','Dishwashing liquid','Oat biscuits'];
  makers text[] := array['Mwea Farmers Cooperative','Pwani Oil Products',
    'Kenya Tea Packers','Bidco Africa','Premier Food Industries',
    'Kitui Flour Mills','Blue Band Kenya','Brookside Dairy'];
  sizes text[] := array['Small pack','Family pack','Catering pack',
    'Refill pouch','Premium selection','Value pack'];
begin
  select id into strict c from public.companies where name='Mama Mboga Stores';
  if not exists(select 1 from public.company_memberships
    where company_id=c and user_id=admin) then
    raise exception 'Expected local demo membership is missing; run seed.sql first';
  end if;
  select id into strict main from public.stock_locations where company_id=c and code='MAIN';
  select id into strict warehouse from public.stock_locations where company_id=c and code='WAREHOUSE';
  select id into strict branch from public.stock_locations where company_id=c and code='WESTLANDS';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,
    'role','authenticated','company_id',c,'user_role','Admin')::text,true);
  perform set_config('app.business_location_id',main::text,true);
  -- Enable the local queue demo once; later runs respect a tester's setting.
  if not exists(select 1 from public.orders where company_id=c and client_ref='list-ux-v1-pending-1') then
    update public.companies set cashier_flow_enabled=true where id=c and not cashier_flow_enabled;
  end if;

  -- These test contacts cannot receive transactional messages. Existing parties
  -- and communication preferences are not changed.
  for i in 1..52 loop
    party := ('dc170000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into public.customers(id,company_id,first_name,last_name,email,
      is_supplier,is_credit_approved,credit_limit,credit_terms_days,
      supplier_credit_limit,supplier_credit_terms_days,payment_terms,notes,
      notifications_enabled,sms_notifications_enabled,whatsapp_notifications_enabled,
      credit_score_notifications_enabled,delivery_address)
    values(party,c,
      case when i>36 then (array['Coast Wholesale','Nairobi Fresh Distributors',
        'Rift Valley Supplies','East Africa Household Goods'])[(i-37)%4+1]
        else (array['Amina','Kamau','Wanjiku','Otieno','Njeri','Achieng',
          'Hassan','Wambui','Mutiso'])[(i-1)%9+1] end,
      case when i>36 then 'Branch '||(i-36) else 'Demo '||lpad(i::text,2,'0') end,
      'list-ux-'||i||'@example.invalid',i>36,i<=36,100000,7+(i%3)*7,
      500000,7+(i%4)*7,'Local demo · net '||(7+(i%3)*7)||' days',
      'list-ux-v1: fictional UI test account',false,false,false,false,
      'Demo collection point '||i||', Nairobi') on conflict(id) do nothing;
  end loop;

  for i in 1..8 loop
    insert into public.manufacturers(company_id,name) values(c,makers[i])
    on conflict do nothing;
  end loop;
  -- 72 families cross the Stock priorities 50-row batch and catalog pages.
  -- 60 have repeat demand; 12 deliberately have insufficient history.
  for i in 1..72 loop
    if not exists(select 1 from public.product_variants
      where company_id=c and sku='UX-'||lpad(i::text,3,'0')) then
      price := 120 + (i%12)*35; cost := round(price*0.65);
      product := public.create_catalog_product(
        names[(i-1)%12+1]||' · '||sizes[(i-1)/12+1],
        jsonb_build_array(jsonb_build_object('name',sizes[(i-1)/12+1],
          'sku','UX-'||lpad(i::text,3,'0'),'price',price,'wholesale_price',cost+15,
          'stock_unit','pack','opening_quantity',400,'opening_unit_cost',cost,
          'opening_location_id',main,'packs',jsonb_build_array(jsonb_build_object(
            'name','Carton of 12','units_per_pack',12,'sale_price',price*11)))));
      update public.products set manufacturer_id=(select id from public.manufacturers
        where company_id=c and name=makers[(i-1)%8+1]) where id=product;
      -- Catalog age is historical fixture metadata; opening inventory and its
      -- ledger entry are created by the domain command above.
      update public.product_variants set created_at=now()-interval '100 days'
        where product_id=product;
    end if;
  end loop;

  -- Reuse an existing open session; do not close another user's working session.
  foreach loc in array array[main,warehouse,branch] loop
    select id into session_id from public.cashier_sessions
      where company_id=c and location_id=loc and status='open' limit 1;
    if session_id is null then
      select jsonb_agg(jsonb_build_object('account_code',account_code,
        'declared',greatest(expected_balance,0))) into declarations
        from public.cashier_expected_balances(loc);
      session_id := public.open_cashier_session_at_location(loc,declarations);
    end if;
  end loop;
  perform set_config('app.business_location_id',main::text,true);

  -- 600 completed orders over 10 selling days, three existing staff personas,
  -- cash/M-Pesa/credit/part-paid. Amounts, FIFO and receivable evidence come from
  -- the posting commands. Only fixture display/event dates are backdated;
  -- accounting and tax posting dates remain the actual hydration date.
  for i in 1..60 loop
    select id,v.price into strict variant,price from public.product_variants v
      where company_id=c and sku='UX-'||lpad(i::text,3,'0');
    party := ('dc170000-0000-4000-8000-'||lpad(((i-1)%36+1)::text,12,'0'))::uuid;
    for j in 1..10 loop
      ref := 'list-ux-v1-sale-'||i||'-'||j;
      if exists(select 1 from public.orders where company_id=c and client_ref=ref) then continue; end if;
      staff := case when i%5=0 then admin when i%2=0
        then '5877ac73-ff8d-457c-afcd-791e66229d03'::uuid
        else '5877ac73-ff8d-457c-afcd-791e66229d02'::uuid end;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,
        'role','authenticated','company_id',c,'user_role',case when staff=admin
          then 'Admin' when i%2=0 then 'Manager' else 'Cashier' end)::text,true);
      lines := jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',3,'unit_price',price));
      if i%5=0 then
        result := public.post_sale_at_location(main,party,lines,'[]',false,ref);
        if j%2=0 then
          perform public.post_customer_receipt(main,party,price,'cash',
            'UX receipt '||i||'-'||j,ref||'-receipt');
        end if;
      else
        payments := jsonb_build_array(jsonb_build_object('method',
          case when j%3=0 then 'mpesa' else 'cash' end,'amount',price*3,
          'reference',case when j%3=0 then 'UX'||i||'D'||j else null end));
        result := public.post_sale_at_location(main,party,lines,payments,false,ref);
      end if;
      sale := (result->>'order_id')::uuid;
      if sale is null then raise exception 'Demo sale did not complete: %',result; end if;
      at_time := date_trunc('day',now())-(j-1)*interval '2 days'+interval '7 hours'+i*interval '3 minutes';
      update public.orders set created_at=at_time,completed_at=at_time,
        credit_due_at=case when is_credit_sale then at_time::date+7 else null end
        where id=sale;
      update public.payments set created_at=at_time where order_id=sale;
    end loop;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,
    'role','authenticated','company_id',c,'user_role','Admin')::text,true);

  -- Supplier balances and recent purchase histories: paid, part-paid and unpaid.
  for i in 1..36 loop
    ref := 'UX-PO-'||lpad(i::text,3,'0');
    select id,v.price into strict variant,price from public.product_variants v
      where company_id=c and sku='UX-'||lpad(i::text,3,'0');
    party := ('dc170000-0000-4000-8000-'||lpad((37+(i-1)%16)::text,12,'0'))::uuid;
    cost := round(price*0.65);
    lines := jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',12,'unit_cost',cost));
    if not exists(select 1 from public.purchases where company_id=c and reference=ref) then
      perform public.record_purchase_with_payment(party,lines,
        case when i%3=0 then 0 when i%3=1 then cost*12 else cost*6 end,
        ref,'CASH_ON_HAND','list-ux-v1: supplier delivery',current_date-(i%20),
        case when i%3=0 then warehouse when i%3=1 then main else branch end);
    end if;
    if i<=8 and not exists(select 1 from public.purchase_drafts
      where company_id=c and reference='UX-DRAFT-'||i) then
      perform public.save_purchase_draft(party,lines,'UX-DRAFT-'||i,
        'list-ux-v1: awaiting supplier confirmation',current_date);
    end if;
  end loop;

  -- Unpaid cashier work and proformas deliberately stay actionable.
  perform set_config('app.business_location_id',main::text,true);
  for i in 1..28 loop
    ref := 'list-ux-v1-pending-'||i;
    if exists(select 1 from public.orders where company_id=c and client_ref=ref) then continue; end if;
    select id,v.price into strict variant,price from public.product_variants v
      where company_id=c and sku='UX-'||lpad((43+(i%18))::text,3,'0');
    party := ('dc170000-0000-4000-8000-'||lpad(((i-1)%36+1)::text,12,'0'))::uuid;
    lines := jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',1,'unit_price',price));
    if i<=12 then
      result := public.post_sale_at_location(main,party,lines,'[]',true,ref);
      sale := (result->>'order_id')::uuid;
      update public.orders set cashier_pending_at=now()-i*interval '7 minutes',
        created_at=now()-i*interval '7 minutes' where id=sale;
    else
      sale := public.save_draft(party,lines);
      update public.orders set client_ref=ref,
        expires_at=case when i%4=0 then now()-interval '1 day' else now()+(i%7+1)*interval '1 day' end
        where id=sale;
      if i%4=0 then update public.orders set status='expired' where id=sale; end if;
    end if;
  end loop;

  -- Approval requests retain their real order context and decision commands.
  for i in 1..12 loop
    ref := 'list-ux-v1-approval-'||i;
    if exists(select 1 from public.orders where company_id=c and client_ref=ref) then continue; end if;
    select id,v.price into strict variant,price from public.product_variants v
      where company_id=c and sku='UX-004';
    sale := public.save_draft(null,jsonb_build_array(jsonb_build_object('variant_id',variant,
      'quantity',1,'unit_price',price,'custom_price',round(price*0.5),
      'override_reason','list-ux-v1: damaged packaging discount '||i)));
    update public.orders set client_ref=ref where id=sale;
    select id into strict entry from public.approvals where company_id=c
      and metadata->>'order_id'=sale::text and status='pending';
    if i%3<>0 then
      perform set_config('request.jwt.claims',jsonb_build_object(
        'sub','5877ac73-ff8d-457c-afcd-791e66229d03','role','authenticated',
        'company_id',c,'user_role','Manager')::text,true);
      if i%3=1 then perform public.approve_request(entry,'Demo: packaging discount accepted');
      else perform public.deny_request(entry,'Demo: discount exceeds agreed limit'); end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',admin,
        'role','authenticated','company_id',c,'user_role','Admin')::text,true);
    end if;
  end loop;

  -- Pickup and delivery examples use consent=false and every notification flag
  -- disabled. No fixture invokes an external messaging/payment provider.
  update public.subscription_tiers set fulfillment_available=true
    where id=(select subscription_tier_id from public.companies where id=c)
      and not fulfillment_available;
  if not exists(select 1 from public.orders where company_id=c and client_ref='list-ux-v1-fulfillment-1') then
    perform public.update_fulfillment_settings(main,jsonb_build_object('enabled',true,
      'pickup_enabled',true,'delivery_enabled',true,'cod_enabled',false,
      'default_delivery_fee_variant_id','dd000000-0000-0000-0000-000000000004',
      'notify_initial',false,'notify_ready',false,'notify_in_transit',false,
      'notify_failed',false,'notify_fulfilled',false));
  end if;
  for i in 1..12 loop
    ref := 'list-ux-v1-fulfillment-'||i;
    if exists(select 1 from public.orders where company_id=c and client_ref=ref) then continue; end if;
    select id,v.price into strict variant,price from public.product_variants v
      where company_id=c and sku='UX-004';
    lines := jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',1,'unit_price',price));
    if i%4=0 then
      lines := lines||jsonb_build_array(jsonb_build_object(
        'variant_id','dd000000-0000-0000-0000-000000000004','quantity',1,'unit_price',50));
    end if;
    result := public.post_fulfillment_sale_at_location(main,
      jsonb_build_object('name','Demo pickup '||i,'phone','070000'||lpad(i::text,4,'0'),'save_as_customer',false),
      lines,
      jsonb_build_array(jsonb_build_object('method','cash','amount',price+case when i%4=0 then 50 else 0 end)),
      jsonb_build_object('type',case when i%4=0 then 'delivery' else 'pickup' end,
        'collection_kind','none','recipient_name','Demo recipient '||i,
        'phone','070000'||lpad(i::text,4,'0'),'address','Demo collection point, Nairobi',
        'preparation_notes','Local UI fixture · no real dispatch',
        'transactional_message_consent',false),ref);
    fulfillment := (result->>'fulfillment_id')::uuid;
    if i%4<>1 then
      perform public.start_fulfillment_preparation(fulfillment,1);
      if i%4 in(0,3) then perform public.mark_fulfillment_ready(fulfillment,2); end if;
    end if;
  end loop;

  -- Real counted adjustments produce a broad range of decisions. Low-cover
  -- products use a short lead time so they differ from reorder candidates.
  for i in 1..72 loop
    select id,v.price into strict variant,price from public.product_variants v
      where company_id=c and sku='UX-'||lpad(i::text,3,'0');
    ref := 'list-ux-v1 counted stock '||i;
    if exists(select 1 from public.inventory_movements where company_id=c
      and meta->>'reason'=ref) then continue; end if;
    -- Use the journal memo as the durable command marker (the movement metadata
    -- shape belongs to the stock domain and is not a seed API).
    if exists(select 1 from public.ledger_journal_entries where company_id=c
      and memo like '%'||ref||'%') then continue; end if;
    target := case i%6 when 0 then 0 when 1 then 2 when 2 then 12
      when 3 then 60 when 4 then 200 else 8 end;
    if i%6=2 then perform public.update_variant_reorder_settings(variant,5,5); end if;
    select coalesce(sum(remaining),0) into current_qty from public.inventory_batches
      where company_id=c and variant_id=variant and stock_location_id=main;
    if current_qty<>target then
      perform public.post_stock_adjustment_at_location(main,variant,current_qty,target,ref,round(price*0.65));
    end if;
  end loop;

  for i in 1..12 loop
    ref := 'list-ux-v1 transfer '||i;
    if not exists(select 1 from public.stock_transfers where company_id=c and notes=ref) then
      select id into strict variant from public.product_variants
        where company_id=c and sku='UX-'||lpad((4+(i-1)*6)::text,3,'0');
      perform public.transfer_stock(main,case when i%2=0 then warehouse else branch end,
        jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',6)),ref);
    end if;
  end loop;

  for i in 1..18 loop
    ref := 'list-ux-v1 expense '||i||' · '||(array['Delivery fuel','Packaging supplies','Electricity tokens'])[(i-1)%3+1];
    if not exists(select 1 from public.ledger_journal_entries where company_id=c and memo=ref) then
      perform public.post_expense(100+i*25,'CASH_ON_HAND','other',ref);
    end if;
    perform public.post_transfer('CASH_ON_HAND','BANK_MAIN',500+i*50,10,
      'list-ux-v1-bank-'||i,'list-ux-v1 · daily banking '||i);
  end loop;

  -- Terminal delivery examples only: no deliverable outbox work is enqueued.
  for i in 1..30 loop
    insert into public.outbox(id,company_id,channel,recipient,subject,body,status,
      attempts,max_attempts,scheduled_after,sent_at,error,source,quota_units,quota_state,created_at)
    values(('dc180000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,c,'email',
      'list-ux-'||i||'@example.invalid','Demo receipt '||i,
      'Local demo message '||i||' — thank you for shopping with Mama Mboga Stores.',
      case i%3 when 0 then 'failed' when 1 then 'sent' else 'cancelled' end,
      3,3,now()-i*interval '1 hour',case when i%3=1 then now()-i*interval '1 hour' end,
      case when i%3=0 then 'Demo delivery failure: fictional recipient' end,
      'direct',0,'released',now()-i*interval '1 hour') on conflict(id) do nothing;
  end loop;

  -- Commission plans and two distinct statement periods use real collected-sale
  -- events and the existing seeded staff; no additional login accounts needed.
  for i in 1..3 loop
    ref := 'UX Demo '||(array['Cashier 2%','Manager 3%','Seasonal 4%'])[i];
    select id into plan_id from public.commission_plans where company_id=c and name=ref;
    if plan_id is null then
      plan_id := public.upsert_commission_plan(ref,100+i*100,current_date-90,null,true,null);
    end if;
    staff := case i when 1 then '5877ac73-ff8d-457c-afcd-791e66229d02'::uuid
      when 2 then '5877ac73-ff8d-457c-afcd-791e66229d03'::uuid else admin end;
    if not exists(select 1 from public.commission_assignments where company_id=c and staff_user_id=staff) then
      perform public.assign_commission_plan(plan_id,staff,current_date-90,null,null);
    end if;
  end loop;
  if not exists(select 1 from public.commission_periods where company_id=c) then
    period_id := public.generate_commission_period(current_date-20,current_date-11);
    perform public.update_commission_period_status(period_id,'approved','list-ux-v1 demo statement');
    perform public.generate_commission_period(current_date-10,current_date);
  end if;
  perform set_config('request.jwt.claims',coalesce(claims,''),true);
end;
$$;

-- Derived insights come from the same transaction facts as production.
-- Domain commands may enqueue mandatory session/fulfillment notices. Cancel
-- only fixture-owned notices in this same transaction, before a worker can see
-- them. Existing sessions/notices from a tester are never matched.
update public.outbox o set status='cancelled',
  error='Local UI fixture: delivery intentionally disabled'
where o.status='pending' and (
  exists(select 1 from public.order_fulfillments f join public.orders s on s.id=f.order_id
    where f.id=o.fulfillment_id and s.client_ref like 'list-ux-v1-fulfillment-%')
  or exists(select 1 from public.cashier_sessions s
    join public.products p on p.company_id=s.company_id and p.created_at=s.created_at
    join public.product_variants v on v.product_id=p.id
    where s.id=o.cashier_session_id and v.sku like 'UX-%')
);
select public.process_analytics_dirty_buckets(10000);
select public.process_credit_dirty_parties(10000);
-- Exercise deferred financial invariants in dry runs as well as real commits.
set constraints all immediate;
commit;
