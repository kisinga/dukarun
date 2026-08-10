-- New customers and suppliers begin eligible for transactional communication.
-- Existing preferences are intentionally untouched.
alter table public.customers
  alter column notifications_enabled set default true,
  alter column sms_notifications_enabled set default true,
  alter column whatsapp_notifications_enabled set default true;

-- Supports exact, company-wide customer history ordered newest-first.
create index if not exists orders_company_customer_created_idx
  on public.orders(company_id,customer_id,created_at desc)
  where customer_id is not null;
