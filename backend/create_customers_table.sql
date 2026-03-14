-- Run in Supabase SQL Editor to create the customers (users) table.

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

create policy "Authenticated users can manage customers"
  on public.customers for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Foreign key link: subscriptions.username references customers.email (optional)
-- alter table public.subscriptions
--   add constraint subscriptions_user_fk
--   foreign key (username) references public.customers(email)
--   on delete cascade;
