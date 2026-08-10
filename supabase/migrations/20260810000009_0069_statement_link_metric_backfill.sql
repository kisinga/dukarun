-- Attach existing reminder deliveries to their secure statement-link metrics.
update public.outbox set body=body
where source='reminder' and customer_statement_link_id is null and body~'/statement/[0-9a-fA-F]{64}';
