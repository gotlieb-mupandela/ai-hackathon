-- ============================================================================
-- NewEra Editorial System — Complete Database Setup
-- Copy & paste this entire file into Supabase SQL Editor and run it.
-- ============================================================================

-- ─── 1. SECTIONS TABLE ────────────────────────────────────────────────────

create table if not exists public.sections (
  id         uuid        default uuid_generate_v4() primary key,
  name       text        not null unique,
  theme      text        not null default '#D32F2F',
  status     text        not null default 'Active' check (status in ('Active', 'Inactive')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.sections enable row level security;

drop policy if exists "Authenticated users can manage sections" on public.sections;
create policy "Authenticated users can manage sections"
  on public.sections for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into public.sections (name, theme, status, updated_at) values
  ('FullPaper',        '#FF0000', 'Active', '2024-07-30'),
  ('NewEra Sport',     '#00AA00', 'Active', '2024-09-05'),
  ('NewEra Business',  '#0080FF', 'Active', '2024-09-05'),
  ('NewEra Vibez',     '#FF5555', 'Active', '2024-09-06'),
  ('NewEra AgriToday', '#2B8D2B', 'Active', '2024-09-23'),
  ('Magazines',        '#BF8040', 'Active', '2025-03-11'),
  ('Kundana',          '#000000', 'Active', '2025-11-03')
on conflict (name) do nothing;

-- ─── 2. PERIODS TABLE ─────────────────────────────────────────────────────

create table if not exists public.periods (
  id            uuid default uuid_generate_v4() primary key,
  period_months integer      not null,
  section       text         not null,
  cost          numeric(10, 2) not null default 0,
  status        text         not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at    timestamptz  not null default now()
);

alter table public.periods enable row level security;

drop policy if exists "Authenticated users can manage periods" on public.periods;
create policy "Authenticated users can manage periods"
  on public.periods for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into public.periods (period_months, section, cost, status) values
  (6,  'NewEra Business',  90,  'Active'),
  (6,  'NewEra Sport',     90,  'Active'),
  (24, 'NewEra AgriToday', 72,  'Active'),
  (12, 'NewEra Vibez',     72,  'Active'),
  (12, 'FullPaper',        600, 'Active'),
  (24, 'NewEra Business',  360, 'Active'),
  (24, 'NewEra Sport',     360, 'Active'),
  (6,  'FullPaper',        300, 'Active'),
  (12, 'NewEra Business',  180, 'Active'),
  (12, 'NewEra Sport',     180, 'Active')
on conflict do nothing;

-- ─── 3. CUSTOMERS TABLE (Users) ────────────────────────────────────────────

create table if not exists public.customers (
  id            uuid        default uuid_generate_v4() primary key,
  customer_name text        not null,
  email         text        not null unique,
  phone_no      text,
  gender        text,
  country       text        default 'Namibia',
  status        text        not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at    timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "Authenticated users can manage customers" on public.customers;
create policy "Authenticated users can manage customers"
  on public.customers for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ─── 4. SUBSCRIPTIONS TABLE ───────────────────────────────────────────────

create sequence if not exists subscriptions_id_seq start 700;

create table if not exists public.subscriptions (
  id            bigint      default nextval('subscriptions_id_seq') primary key,
  customer_id   uuid,
  username      text        not null,
  section       text        not null,
  free_access   boolean     not null default false,
  status        text        not null default 'Active' check (status in ('Active', 'Inactive')),
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (customer_id) references public.customers(id) on delete set null
);

alter table public.subscriptions enable row level security;

drop policy if exists "Authenticated users can manage subscriptions" on public.subscriptions;
create policy "Authenticated users can manage subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ─── 5. PAYMENTS TABLE ────────────────────────────────────────────────────

create table if not exists public.payments (
  id             bigserial   primary key,
  user_id        text        not null,
  cost           numeric(10,2) not null,
  method         text        not null default 'Bank Transfer',
  reference      text,
  section        text        not null,
  period_months  integer     not null default 1,
  created_at     timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists "Authenticated users can manage payments" on public.payments;
create policy "Authenticated users can manage payments"
  on public.payments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================================
-- Done! All tables are now created with proper relationships.
-- ============================================================================
