-- Run in Supabase SQL Editor to create the subscriptions table.

create sequence if not exists subscriptions_id_seq start 700;

create table if not exists public.subscriptions (
  id          bigint      default nextval('subscriptions_id_seq') primary key,
  username    text        not null,
  section     text        not null,
  free_access boolean     not null default false,
  status      text        not null default 'Active' check (status in ('Active', 'Inactive')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Authenticated users can manage subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
