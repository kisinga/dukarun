-- Cleaner controlled document copy and final repair for escaped line breaks.

with copy(template_key,sms_body,whatsapp_body) as (
  values
    ('manual-receipt',
      '{{company_name}} receipt {{document_number}}. Total KES {{total}}. View or print: {{document_url}}',
      E'*Receipt {{document_number}}*\n{{company_name}}\n\n*Total:* KES {{total}}\n\nView or print your receipt:\n{{document_url}}'),
    ('manual-invoice',
      '{{company_name}} invoice {{document_number}}. Total KES {{total}}; balance KES {{balance}}. View: {{document_url}}',
      E'*Invoice {{document_number}}*\n{{company_name}}\n\n*Total:* KES {{total}}\n*Balance due:* KES {{balance}}\n\nView or print your invoice:\n{{document_url}}'),
    ('manual-proforma',
      '{{company_name}} proforma {{document_number}}. Total KES {{total}}; valid until {{valid_until}}. View: {{document_url}}',
      E'*Proforma {{document_number}}*\n{{company_name}}\n\n*Total:* KES {{total}}\n*Valid until:* {{valid_until}}\n\nView or print your proforma:\n{{document_url}}'),
    ('manual-purchase-order',
      '{{company_name}} purchase order {{document_number}}. Total KES {{total}}. View: {{document_url}}',
      E'*Purchase order {{document_number}}*\n{{company_name}}\n\n*Total:* KES {{total}}\n\nView or print the order:\n{{document_url}}'),
    ('manual-document-company-copy',
      'Company copy: {{document_label}} {{document_number}} sent to {{party_name}}. View: {{document_url}}',
      E'*Company copy · {{document_label}} {{document_number}}*\n\nSent to: {{party_name}}\n\nView document:\n{{document_url}}')
)
update public.message_templates mt set sms_body=copy.sms_body,whatsapp_body=copy.whatsapp_body,
  version=mt.version+1,updated_at=now()
from copy where mt.company_id is null and mt.template_key=copy.template_key
  and (mt.sms_body is distinct from copy.sms_body or mt.whatsapp_body is distinct from copy.whatsapp_body);

-- Already queued bodies cannot be safely re-rendered, but escaped newline
-- artifacts can be repaired without changing their meaning.
update public.outbox set body=replace(replace(body,E'\\n',E'\n'),'/n/n',E'\n\n')
where status='pending' and channel='whatsapp'
  and source in ('manual_document','manual_document_copy','reminder')
  and (position(E'\\n' in body)>0 or position('/n/n' in body)>0);
