-- Demo seed data — run AFTER 0001_init.sql AND after creating the
-- four demo auth users via Supabase Dashboard → Authentication → Add user.
--
-- Demo users to create (Authentication → Users → "Add user → Create new user"):
--   1) ops@warehouse.demo            password: demo1234   (operator)
--   2) supervisor@warehouse.demo     password: demo1234   (operator)
--   3) alice@acmefoods.demo          password: demo1234   (customer Acme)
--   4) ben@globalpharma.demo         password: demo1234   (customer GlobalPharma)
--
-- Once created, run THIS file. It looks up the users by email and links them.

-- ---- Tenants -----------------------------------------------------------
insert into public.tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Acme Foods Ltd'),
  ('22222222-2222-2222-2222-222222222222', 'GlobalPharma Inc')
on conflict (id) do nothing;

-- ---- Profiles ----------------------------------------------------------
insert into public.profiles (user_id, tenant_id, full_name, role)
select u.id, null, 'Olu Ops (Warehouse Operator)', 'operator'
  from auth.users u where u.email = 'ops@warehouse.demo'
on conflict (user_id) do update
  set tenant_id = excluded.tenant_id, full_name = excluded.full_name, role = excluded.role;

insert into public.profiles (user_id, tenant_id, full_name, role)
select u.id, null, 'Sade Supervisor', 'operator'
  from auth.users u where u.email = 'supervisor@warehouse.demo'
on conflict (user_id) do update
  set tenant_id = excluded.tenant_id, full_name = excluded.full_name, role = excluded.role;

insert into public.profiles (user_id, tenant_id, full_name, role)
select u.id, '11111111-1111-1111-1111-111111111111', 'Alice (Acme Foods)', 'customer_admin'
  from auth.users u where u.email = 'alice@acmefoods.demo'
on conflict (user_id) do update
  set tenant_id = excluded.tenant_id, full_name = excluded.full_name, role = excluded.role;

insert into public.profiles (user_id, tenant_id, full_name, role)
select u.id, '22222222-2222-2222-2222-222222222222', 'Ben (GlobalPharma)', 'customer_admin'
  from auth.users u where u.email = 'ben@globalpharma.demo'
on conflict (user_id) do update
  set tenant_id = excluded.tenant_id, full_name = excluded.full_name, role = excluded.role;

-- ---- SKUs --------------------------------------------------------------
insert into public.skus (id, tenant_id, code, name, unit_of_measure, tags) values
  ('aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'RICE-50KG',  'Premium Basmati Rice 50kg bag', 'bag',  '{food,non-perishable}'),
  ('aaaaaaa2-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'OIL-20L',    'Sunflower Oil 20L drum',        'drum', '{food,liquid}'),
  ('aaaaaaa3-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'TIN-TOM-24', 'Tomato Paste 24-can pack',      'pack', '{food,non-perishable}'),
  ('bbbbbbb1-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'PARA-500',   'Paracetamol 500mg, 1000-tab bottle', 'bottle', '{cold-chain,high-value,pharma}'),
  ('bbbbbbb2-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'AMOX-250',   'Amoxicillin 250mg, 500-cap bottle',  'bottle', '{cold-chain,high-value,pharma}')
on conflict (tenant_id, code) do nothing;

-- ---- Lots + initial GoodsReceived events ------------------------------
do $$
declare
  v_ops uuid;
begin
  select id into v_ops from auth.users where email = 'ops@warehouse.demo';

  -- Acme Foods lots
  perform public.create_intake(
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaa1-0000-0000-0000-000000000001',
    'LOT-RICE-2026-001', 500, '2027-12-31', 'Bonded warehouse zone A', v_ops
  );
  perform public.create_intake(
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaa2-0000-0000-0000-000000000002',
    'LOT-OIL-2026-014',  120, '2027-06-30', 'Zone B, rack 4', v_ops
  );
  perform public.create_intake(
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaa3-0000-0000-0000-000000000003',
    'LOT-TOM-2026-003',  800, '2028-03-31', 'Zone A, rack 12', v_ops
  );

  -- GlobalPharma lots
  perform public.create_intake(
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbb1-0000-0000-0000-000000000001',
    'LOT-PARA-2026-Q1',  1500, '2028-01-31', 'Cold chain zone, rack 1', v_ops
  );
  perform public.create_intake(
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbb2-0000-0000-0000-000000000002',
    'LOT-AMOX-2026-Q1',  900,  '2027-09-30', 'Cold chain zone, rack 2', v_ops
  );
end $$;
