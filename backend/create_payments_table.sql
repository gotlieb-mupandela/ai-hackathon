-- Run in Supabase SQL Editor to create the payments table.

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

create policy "Authenticated users can manage payments"
  on public.payments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
