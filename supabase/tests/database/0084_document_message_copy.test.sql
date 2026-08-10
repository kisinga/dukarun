begin;
select plan(4);

select is((select count(*)::int from public.message_templates where template_key like 'manual-%'
  and position(E'\\n' in coalesce(whatsapp_body,''))>0),0,'document templates contain no escaped newline text');
select is((select count(*)::int from public.message_templates where template_key like 'manual-%'
  and position('/n' in coalesce(whatsapp_body,''))>0),0,'document templates contain no slash-n artifacts');
select ok((select position(E'\n\n' in whatsapp_body)>0 and position('*Balance due:*' in whatsapp_body)>0
  from public.message_templates where template_key='manual-invoice'),'invoice WhatsApp copy has readable hierarchy');
select ok((select position('View or print your receipt:' in whatsapp_body)>0
  from public.message_templates where template_key='manual-receipt'),'receipt CTA wording is direct');

select * from finish();
rollback;
