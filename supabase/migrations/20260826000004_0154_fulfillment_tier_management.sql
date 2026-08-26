-- Make the fulfillment entitlement manageable through the canonical tier command.
-- The final argument is optional so older platform clients preserve the current gate.
drop function public.platform_save_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,integer,uuid,boolean
);

create or replace function public.platform_save_tier(
  p_code text,p_name text,p_price_monthly bigint,p_price_yearly bigint,
  p_multiple_locations_enabled boolean,p_staff_performance_enabled boolean,
  p_commissions_available boolean,p_storefront_available boolean,
  p_customer_campaigns_available boolean,p_payment_reminders_available boolean,
  p_max_team_members integer default null,p_max_products integer default null,
  p_max_stock_locations integer default null,p_max_orders_per_month integer default null,
  p_sms_per_period integer default null,p_whatsapp_per_period integer default null,
  p_tier_id uuid default null,p_is_active boolean default null,
  p_fulfillment_available boolean default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;v_previous_storefront boolean;
begin
  perform public.assert_platform_admin();
  if not p_multiple_locations_enabled and coalesce(p_max_stock_locations,1)>1 then
    raise exception 'invalid_tier: multiple locations must be enabled when location limit exceeds one';
  end if;
  if p_tier_id is not null then
    select storefront_available into v_previous_storefront
    from public.subscription_tiers where id=p_tier_id for update;
    if not found then raise exception 'tier_not_found: %',p_tier_id; end if;
    update public.subscription_tiers set name=p_name,price_monthly=p_price_monthly,
      price_yearly=p_price_yearly,multiple_locations_enabled=p_multiple_locations_enabled,
      staff_performance_enabled=p_staff_performance_enabled,
      commissions_available=p_commissions_available,max_team_members=p_max_team_members,
      max_products=p_max_products,max_stock_locations=p_max_stock_locations,
      max_orders_per_month=p_max_orders_per_month,sms_per_period=p_sms_per_period,
      storefront_available=p_storefront_available,
      customer_campaigns_available=p_customer_campaigns_available,
      payment_reminders_available=p_payment_reminders_available,
      whatsapp_per_period=p_whatsapp_per_period,
      fulfillment_available=coalesce(p_fulfillment_available,fulfillment_available),
      is_active=coalesce(p_is_active,is_active),updated_at=now()
    where id=p_tier_id returning id into v_id;
    if v_previous_storefront and not p_storefront_available then
      update public.companies set storefront_entitlement_grace_end=now()+interval '7 days'
      where subscription_tier_id=v_id and public_storefront_enabled;
    elsif not v_previous_storefront and p_storefront_available then
      update public.companies set storefront_entitlement_grace_end=null
      where subscription_tier_id=v_id;
    end if;
  else
    insert into public.subscription_tiers(
      code,name,price_monthly,price_yearly,multiple_locations_enabled,
      staff_performance_enabled,commissions_available,max_team_members,max_products,
      max_stock_locations,max_orders_per_month,sms_per_period,storefront_available,
      customer_campaigns_available,payment_reminders_available,whatsapp_per_period,
      fulfillment_available,is_active
    ) values(
      p_code,p_name,p_price_monthly,p_price_yearly,p_multiple_locations_enabled,
      p_staff_performance_enabled,p_commissions_available,p_max_team_members,p_max_products,
      p_max_stock_locations,p_max_orders_per_month,p_sms_per_period,p_storefront_available,
      p_customer_campaigns_available,p_payment_reminders_available,p_whatsapp_per_period,
      coalesce(p_fulfillment_available,false),coalesce(p_is_active,true)
    ) returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.platform_save_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,integer,uuid,boolean,boolean
) from public,anon;
grant execute on function public.platform_save_tier(
  text,text,bigint,bigint,boolean,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,integer,integer,integer,uuid,boolean,boolean
) to authenticated,service_role;

comment on column public.subscription_tiers.fulfillment_available is
  'Tier entitlement for pickup, delivery, fulfillment operations, tracking, and COD.';
