begin;
select plan(8);

select has_table('public', 'purchase_lines', 'durable purchase lines exist');
select has_table('public', 'purchase_drafts', 'purchase drafts exist');
select has_column('public', 'purchases', 'purchase_date', 'purchase date is retained');
select has_column('public', 'purchases', 'stock_location_id', 'receiving location is retained');
select has_function('public', 'save_purchase_draft', array['uuid','jsonb','text','text','date','uuid'], 'draft save RPC exists');
select has_function('public', 'confirm_purchase_draft', array['uuid','boolean','text','uuid'], 'draft confirmation RPC exists');
select has_function('public', 'cancel_purchase_draft', array['uuid'], 'draft cancellation RPC exists');
select has_function('public', 'pay_purchase', array['uuid','bigint','text'], 'selected-purchase payment RPC exists');

select * from finish();
rollback;
