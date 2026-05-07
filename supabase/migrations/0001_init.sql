-- Warehouse Management Lab — initial schema
-- Run this in your Supabase project's SQL Editor.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- Tenants  (depositor organizations)
-- ============================================================
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Profiles (extends auth.users)
-- ============================================================
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid references public.tenants(id) on delete set null,
  full_name  text not null,
  role       text not null check (role in ('operator','customer_admin','customer_user')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Catalog: SKUs (tenant-scoped)
-- ============================================================
create table public.skus (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  code            text not null,
  name            text not null,
  unit_of_measure text not null default 'unit',
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ============================================================
-- Lots (a specific deposit/batch).  on_hand_qty is the projector.
-- ============================================================
create table public.lots (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  sku_id        uuid not null references public.skus(id) on delete restrict,
  lot_code      text not null,
  initial_qty   numeric(20,3) not null check (initial_qty > 0),
  on_hand_qty   numeric(20,3) not null check (on_hand_qty >= 0),
  expiry_date   date,
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (tenant_id, lot_code)
);
create index lots_tenant_idx on public.lots(tenant_id);

-- ============================================================
-- Movement events (the append-only ledger)
-- ============================================================
create type public.event_type as enum (
  'goods_received',
  'goods_picked',
  'goods_issued',
  'goods_returned',
  'goods_adjusted'
);

create table public.movement_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  lot_id         uuid not null references public.lots(id) on delete cascade,
  event_type     public.event_type not null,
  quantity       numeric(20,3) not null,        -- signed
  actor_id       uuid references auth.users(id),
  withdrawal_id  uuid,                           -- forward ref, nullable
  reason         text,
  metadata       jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),
  recorded_at    timestamptz not null default now()
);
create index events_tenant_idx on public.movement_events(tenant_id, recorded_at desc);
create index events_lot_idx    on public.movement_events(lot_id, recorded_at desc);

-- ============================================================
-- Withdrawals (state machine)
-- ============================================================
create type public.withdrawal_status as enum (
  'requested','approved','rejected','awaiting_ack',
  'acknowledged','released','ack_timeout','cancelled'
);

create table public.withdrawals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  lot_id            uuid not null references public.lots(id) on delete restrict,
  requested_qty     numeric(20,3) not null check (requested_qty > 0),
  requested_by      uuid references auth.users(id),
  status            public.withdrawal_status not null default 'requested',
  approved_by       uuid references auth.users(id),
  approved_at       timestamptz,
  otp_code          text,                       -- demo only; in prod, store hash
  otp_expires_at    timestamptz,
  acknowledged_by   uuid references auth.users(id),
  acknowledged_at   timestamptz,
  released_at       timestamptz,
  notes             text,
  created_at        timestamptz not null default now()
);
create index withdrawals_tenant_idx on public.withdrawals(tenant_id, created_at desc);
create index withdrawals_status_idx on public.withdrawals(status);

-- ============================================================
-- Helper functions for RLS
-- ============================================================
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'operator' from public.profiles where user_id = auth.uid()), false)
$$;

-- ============================================================
-- Atomic withdrawal approval — the load-bearing concurrency primitive.
-- Locks the lot row, validates qty, writes the GoodsPicked event,
-- decrements the projector, and advances the withdrawal state.
-- ============================================================
create or replace function public.approve_withdrawal(p_withdrawal_id uuid, p_approver uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w      withdrawals%rowtype;
  v_lot    lots%rowtype;
  v_otp    text;
  v_event  uuid;
begin
  select * into v_w from withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'requested' then
    raise exception 'withdrawal % is in state %, cannot approve', v_w.id, v_w.status;
  end if;

  select * into v_lot from lots where id = v_w.lot_id for update;
  if v_lot.on_hand_qty < v_w.requested_qty then
    raise exception 'insufficient stock: % available, % requested',
      v_lot.on_hand_qty, v_w.requested_qty;
  end if;

  insert into movement_events
    (tenant_id, lot_id, event_type, quantity, actor_id, withdrawal_id, reason)
  values
    (v_w.tenant_id, v_w.lot_id, 'goods_picked', -v_w.requested_qty,
     p_approver, v_w.id, 'pick for withdrawal')
  returning id into v_event;

  update lots set on_hand_qty = on_hand_qty - v_w.requested_qty
    where id = v_w.lot_id;

  -- 6-digit OTP (demo only)
  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');

  update withdrawals set
    status         = 'awaiting_ack',
    approved_by    = p_approver,
    approved_at    = now(),
    otp_code       = v_otp,
    otp_expires_at = now() + interval '4 hours'
  where id = v_w.id;

  return json_build_object(
    'withdrawal_id', v_w.id,
    'status',        'awaiting_ack',
    'otp',           v_otp,
    'lot_remaining', v_lot.on_hand_qty - v_w.requested_qty,
    'pick_event_id', v_event
  );
end;
$$;

-- ============================================================
-- Acknowledge & release
-- ============================================================
create or replace function public.acknowledge_withdrawal(p_withdrawal_id uuid, p_otp text, p_actor uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w   withdrawals%rowtype;
  v_lot lots%rowtype;
begin
  select * into v_w from withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'awaiting_ack' then
    raise exception 'withdrawal % is in state %, cannot acknowledge', v_w.id, v_w.status;
  end if;
  if v_w.otp_expires_at < now() then
    raise exception 'OTP expired';
  end if;
  if v_w.otp_code <> p_otp then
    raise exception 'invalid OTP';
  end if;

  select * into v_lot from lots where id = v_w.lot_id;

  insert into movement_events
    (tenant_id, lot_id, event_type, quantity, actor_id, withdrawal_id, reason)
  values
    (v_w.tenant_id, v_w.lot_id, 'goods_issued', 0,
     p_actor, v_w.id, 'released to customer (ack)');

  update withdrawals set
    status          = 'released',
    acknowledged_by = p_actor,
    acknowledged_at = now(),
    released_at     = now()
  where id = v_w.id;

  return json_build_object(
    'withdrawal_id',  v_w.id,
    'status',         'released',
    'lot_remaining',  v_lot.on_hand_qty
  );
end;
$$;

-- ============================================================
-- Reject
-- ============================================================
create or replace function public.reject_withdrawal(p_withdrawal_id uuid, p_actor uuid, p_reason text)
returns json language plpgsql security definer set search_path = public as $$
declare v_w withdrawals%rowtype;
begin
  select * into v_w from withdrawals where id = p_withdrawal_id for update;
  if v_w.status <> 'requested' then
    raise exception 'cannot reject withdrawal in state %', v_w.status;
  end if;
  update withdrawals set status='rejected', notes=p_reason where id = v_w.id;
  return json_build_object('withdrawal_id', v_w.id, 'status','rejected');
end $$;

-- ============================================================
-- Intake (creates lot + GoodsReceived event in one tx)
-- ============================================================
create or replace function public.create_intake(
  p_tenant_id uuid, p_sku_id uuid, p_lot_code text,
  p_qty numeric, p_expiry date, p_notes text, p_actor uuid
)
returns json language plpgsql security definer set search_path = public as $$
declare v_lot uuid;
begin
  insert into lots (tenant_id, sku_id, lot_code, initial_qty, on_hand_qty, expiry_date, notes, created_by)
  values (p_tenant_id, p_sku_id, p_lot_code, p_qty, p_qty, p_expiry, p_notes, p_actor)
  returning id into v_lot;

  insert into movement_events
    (tenant_id, lot_id, event_type, quantity, actor_id, reason)
  values
    (p_tenant_id, v_lot, 'goods_received', p_qty, p_actor, 'intake at dock');

  return json_build_object('lot_id', v_lot);
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.tenants         enable row level security;
alter table public.profiles        enable row level security;
alter table public.skus            enable row level security;
alter table public.lots            enable row level security;
alter table public.movement_events enable row level security;
alter table public.withdrawals     enable row level security;

-- tenants: operators see all; customers see own
create policy tenants_select on public.tenants for select to authenticated
  using (public.is_operator() or id = public.current_tenant_id());

-- profiles: own profile, plus same-tenant or operator
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_operator()
    or tenant_id = public.current_tenant_id()
  );

create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id = auth.uid());

-- skus / lots / events / withdrawals: tenant-scoped reads
create policy skus_select on public.skus for select to authenticated
  using (public.is_operator() or tenant_id = public.current_tenant_id());

create policy lots_select on public.lots for select to authenticated
  using (public.is_operator() or tenant_id = public.current_tenant_id());

create policy events_select on public.movement_events for select to authenticated
  using (public.is_operator() or tenant_id = public.current_tenant_id());

create policy withdrawals_select on public.withdrawals for select to authenticated
  using (public.is_operator() or tenant_id = public.current_tenant_id());

-- Customer can request a withdrawal for their own tenant
create policy withdrawals_insert on public.withdrawals for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

-- Realtime: enable for the customer dashboard live balance updates
alter publication supabase_realtime add table public.lots;
alter publication supabase_realtime add table public.withdrawals;
alter publication supabase_realtime add table public.movement_events;
