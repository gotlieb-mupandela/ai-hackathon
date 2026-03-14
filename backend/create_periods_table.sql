-- Run this in your Supabase SQL Editor to create the periods table.

create table if not exists public.periods (
  id            uuid default uuid_generate_v4() primary key,
  period_months integer      not null,
  section       text         not null,
  cost          numeric(10, 2) not null default 0,
  status        text         not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at    timestamptz  not null default now()
);

-- Allow authenticated users (admins) to manage periods
alter table public.periods enable row level security;

create policy "Admins can manage periods"
  on public.periods
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed with sample data (optional — remove if not needed)
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
