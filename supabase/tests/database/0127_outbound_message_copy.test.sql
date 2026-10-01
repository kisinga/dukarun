begin;
select plan(8);

select is(
  (select count(*)::integer from public.message_templates
   where position(E'\\n' in coalesce(whatsapp_body,''))>0),
  0,
  'WhatsApp templates never expose escaped newline text'
);

select is(
  (select count(*)::integer from public.message_templates
   where template_key in ('payment-due','payment-overdue-3','payment-overdue-7','payment-overdue-14')
     and position(E'\n\n' in coalesce(whatsapp_body,''))>0),
  4,
  'every payment reminder uses real WhatsApp paragraph breaks'
);

select is(
  (select count(*)::integer from public.message_templates
   where template_key in ('payment-due','payment-overdue-3','payment-overdue-7','payment-overdue-14')
     and whatsapp_body like '%account statement:%'
     and whatsapp_body like '%{{statement_url}}%'),
  4,
  'every payment reminder accurately labels its account statement link'
);

select ok(
  (select whatsapp_body like '%Oldest unpaid due date: {{due_date}}.%'
     and whatsapp_body like '%already paid or need help%'
   from public.message_templates where template_key='payment-due' and company_id is null),
  'reminder copy states the absolute date and gives the customer a helpful next step'
);

select ok(
  (select whatsapp_body like '%Amount currently due:%'
     and whatsapp_body like '%discuss the next step%'
   from public.message_templates where template_key='payment-overdue-14' and company_id is null),
  'late reminder copy is firm, factual, and non-threatening'
);

select ok(
  (select position(E'\n\n' in whatsapp_body)>0
     and whatsapp_body like '%View your account statement:%'
   from public.message_templates where template_key='credit-score-band-change'
     and company_id is null),
  'credit profile WhatsApp copy has real line breaks and a precise CTA'
);

select ok(
  (select whatsapp_body like '%secure link expires on {{expires_at}}%'
   from public.message_templates where template_key='manual-customer-statement'
     and company_id is null),
  'manual statement copy explains the secure link expiry'
);

select ok(
  (select whatsapp_body like '%Track your order:%'
     and whatsapp_body like '%{{pin_label}}:%'
   from public.message_templates where template_key='fulfillment-initial'
     and company_id is null),
  'initial fulfillment copy separates the tracking link and appropriate PIN'
);

select * from finish();
rollback;
