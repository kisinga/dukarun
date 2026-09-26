-- Audit and polish the fixed outbound copy, repair escaped WhatsApp line breaks, and
-- prevent future system or operator template edits from storing "\\n" as text.

with revised(template_key,sms_body,whatsapp_body) as (
  values
    ('customer-broadcast',
      'Hi {{customer_first_name}}, here is an update from {{store_name}}. Contact: {{store_contact}}',
      E'*Update from {{store_name}}*\n\nHi {{customer_first_name}}, here is an update from the store.\n\nContact: {{store_contact}}'),
    ('payment-due',
      'Hi {{customer_first_name}}, KES {{outstanding_balance}} is due to {{store_name}} today ({{due_date}}). View your account statement: {{statement_url}}',
      E'*Payment due today*\n\nHi {{customer_first_name}}, your balance of *KES {{outstanding_balance}}* with {{store_name}} is due today ({{due_date}}).\n\nView your account statement:\n{{statement_url}}\n\nIf you have already paid or need help, please contact {{store_name}}.'),
    ('payment-overdue-3',
      'Hi {{customer_first_name}}, KES {{outstanding_balance}} owed to {{store_name}} was due {{due_date}} and is 3 days overdue. Account statement: {{statement_url}}',
      E'*Payment reminder · 3 days overdue*\n\nHi {{customer_first_name}}, your balance of *KES {{outstanding_balance}}* with {{store_name}} was due on {{due_date}}.\n\nView your account statement:\n{{statement_url}}\n\nIf you have already paid, please contact {{store_name}} so they can update your account.'),
    ('payment-overdue-7',
      'Hi {{customer_first_name}}, KES {{outstanding_balance}} owed to {{store_name}} is 7 days overdue. Please pay or contact the store. Account statement: {{statement_url}}',
      E'*Payment reminder · 7 days overdue*\n\nHi {{customer_first_name}}, your balance of *KES {{outstanding_balance}}* with {{store_name}} is 7 days overdue.\n\nView your account statement:\n{{statement_url}}\n\nPlease arrange payment or contact {{store_name}} if you need help.'),
    ('payment-overdue-14',
      'Hi {{customer_first_name}}, KES {{outstanding_balance}} owed to {{store_name}} is 14 days overdue. Please contact the store about payment. Account statement: {{statement_url}}',
      E'*Payment reminder · 14 days overdue*\n\nHi {{customer_first_name}}, your balance of *KES {{outstanding_balance}}* with {{store_name}} is 14 days overdue.\n\nView your account statement:\n{{statement_url}}\n\nPlease contact {{store_name}} to confirm payment or discuss the next step.'),
    ('platform-update',
      'Hi {{merchant_name}}, here is an update about your {{tier}} Dukarun account.',
      E'*Dukarun account update*\n\nHi {{merchant_name}}, here is an update about your {{tier}} Dukarun account.\n\n— Dukarun'),
    ('manual-customer-statement',
      '{{company_name}} account statement for {{party_name}}. {{account_summary}} View your statement: {{statement_url}} (link expires in 7 days)',
      E'*Your account statement*\n\n{{company_name}}\nAccount: {{party_name}}\n{{account_summary}}\n\nView your statement:\n{{statement_url}}\n\nThis secure link expires in 7 days.'),
    ('team-invitation',
      '{{inviter_name}} invited you to join {{company_name}} as {{role_name}}. Sign in with this phone at {{app_url}}/login by {{expires_at}}. Do not register a new company.',
      E'*Invitation to join {{company_name}}*\n\n{{inviter_name}} invited you to join as *{{role_name}}*.\n\nOpen {{app_url}}/login and sign in with this phone number by {{expires_at}}.\n\nDo not register a new company; your access will be added automatically.'),
    ('team-invitation-primary',
      '{{inviter_name}} invited {{member_name}} ({{member_phone}}) to join {{company_name}} as {{role_name}}.',
      E'*Team invitation sent*\n\n{{inviter_name}} invited *{{member_name}}* ({{member_phone}}) to join {{company_name}} as *{{role_name}}*.'),
    ('team-invitation-accepted-primary',
      '{{member_name}} accepted the invitation to join {{company_name}} as {{role_name}}.',
      E'*Team member joined*\n\n{{member_name}} accepted the invitation and joined {{company_name}} as *{{role_name}}*.'),
    ('fulfillment-initial',
      '{{company_name}} received order {{order_code}} and is preparing it. Track: {{tracking_url}} PIN: {{pin}}',
      E'*Order {{order_code}} · {{company_name}}*\n\nWe received your order and are preparing it.\n\nTrack your order:\n{{tracking_url}}\n\nCollection PIN: *{{pin}}*'),
    ('fulfillment-ready',
      '{{company_name}} order {{order_code}} is ready.',
      E'*Order {{order_code}} · {{company_name}}*\n\nYour order is ready.'),
    ('fulfillment-in-transit',
      '{{company_name}} order {{order_code}} is on the way.',
      E'*Order {{order_code}} · {{company_name}}*\n\nYour order is on the way.'),
    ('fulfillment-failed',
      '{{company_name}} could not complete order {{order_code}}. The store will contact you about the next step.',
      E'*Order {{order_code}} needs attention*\n\n{{company_name}} could not complete the order. The store will contact you about the next step.'),
    ('fulfillment-fulfilled',
      '{{company_name}} order {{order_code}} is complete. Thank you.',
      E'*Order {{order_code}} complete*\n\nThank you for shopping with {{company_name}}.'),
    ('credit-score-band-change',
      'Your Dukarun credit profile is now {{score}}/10 ({{band}}). Reason: {{reason}}. What this means: {{consequence}} Review your account statement: {{statement_url}}',
      E'*Credit profile update*\n\nYour score is now *{{score}}/10 ({{band}})*.\n\n*Reason:* {{reason}}\n*What this means:* {{consequence}}\n\nReview your account statement:\n{{statement_url}}')
)
update public.message_templates mt
set sms_body=revised.sms_body,
    whatsapp_body=revised.whatsapp_body,
    version=mt.version+1,
    updated_at=now()
from revised
where mt.company_id is null
  and mt.template_key=revised.template_key
  and (mt.sms_body is distinct from revised.sms_body
    or mt.whatsapp_body is distinct from revised.whatsapp_body);

-- Repair any remaining legacy or operator-authored templates before enforcing
-- the storage invariant. Textareas already submit real newline characters.
update public.message_templates
set whatsapp_body=replace(whatsapp_body,E'\\n',E'\n'),
    version=version+1,
    updated_at=now()
where position(E'\\n' in coalesce(whatsapp_body,''))>0;

alter table public.message_templates
  drop constraint if exists message_templates_whatsapp_no_escaped_newline;
alter table public.message_templates
  add constraint message_templates_whatsapp_no_escaped_newline
  check (whatsapp_body is null or position(E'\\n' in whatsapp_body)=0);

-- Queued bodies are rendered snapshots. They cannot be fully re-rendered
-- without their original value map, but their formatting and CTA labels can
-- be repaired safely before delivery.
update public.outbox
set body=replace(body,E'\\n',E'\n'),
    fallback_body=case when fallback_body is null then null
      else replace(fallback_body,E'\\n',E'\n') end
where status='pending'
  and (position(E'\\n' in body)>0
    or position(E'\\n' in coalesce(fallback_body,''))>0);

update public.outbox
set body=replace(
      replace(
        replace(body,'View statement:','View your account statement:'),
        ' or view: ',' or review your account statement: '
      ),
      'Statement:','Account statement:'
    ),
    fallback_body=case when fallback_body is null then null else replace(
      replace(fallback_body,'View statement:','View your account statement:'),
      'Statement:','Account statement:'
    ) end
where status='pending'
  and template_key in (
    'payment-due','payment-overdue-3','payment-overdue-7','payment-overdue-14',
    'manual-customer-statement','credit-score-band-change'
  );
