-- Fresh Supabase databases may grant public-schema tables to API roles by default.
-- Make existing private surfaces explicit rather than relying on bootstrap defaults.
revoke all on public.catalog_search_documents from public, anon, authenticated;
revoke all on public.payment_provider_accounts from public, anon, authenticated;

-- Only Terms-aware registration wrappers may provision for authenticated callers.
-- Service-role and security-definer registration callers retain access.
revoke execute on function public.provision_company(text,text,text,text,text)
  from public, anon, authenticated;

-- Reapply the intended column allowlist after removing the broad bootstrap grant.
-- REVOKE UPDATE also clears column grants, so they must be restored explicitly.
revoke update on public.companies from authenticated;

grant update (
  name, logo_path, public_storefront_enabled, public_slug, public_whatsapp_number,
  enable_printer, low_stock_threshold, cashier_flow_enabled, batch_expiry_enabled,
  cash_control_enabled, require_opening_count, variance_notification_threshold,
  email, address, proforma_validity_days
) on public.companies to authenticated;
