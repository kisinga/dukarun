-- Hard-migrate shared document links and remove review-bypassing campaign RPCs.

-- Old customer and company-copy messages shared one URL. Keep that URL attributed
-- to the primary recipient and remove the misleading company-copy association.
update public.outbox o
set external_document_link_id = null
from public.external_document_links l
where o.external_document_link_id = l.id
  and o.document_copy_role = 'company'
  and l.audience_role = 'legacy_shared';

update public.external_document_links
set audience_role = 'primary'
where audience_role = 'legacy_shared';

alter table public.external_document_links
  drop constraint if exists external_document_links_audience_role_check;
alter table public.external_document_links
  add constraint external_document_links_audience_role_check
  check (audience_role in ('primary', 'company_copy'));

drop function if exists public.platform_broadcast(text, text, text);
drop function if exists public.platform_send_campaign(text, text, text, text, text, uuid, text, uuid[]);
