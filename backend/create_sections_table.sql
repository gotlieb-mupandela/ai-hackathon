-- Run this in your Supabase SQL Editor to create the sections table.

create table if not exists public.sections (
  id         uuid        default uuid_generate_v4() primary key,
  name       text        not null unique,
  theme      text        not null default '#D32F2F',
  status     text        not null default 'Active' check (status in ('Active', 'Inactive')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Allow authenticated users to manage sections
alter table public.sections enable row level security;

create policy "Admins can manage sections"
  on public.sections
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed with sample data (matches screenshot)
insert into public.sections (name, theme, status, updated_at) values
  ('FullPaper',        '#FF0000', 'Active', '2024-07-30'),
  ('NewEra Sport',     '#00AA00', 'Active', '2024-09-05'),
  ('NewEra Business',  '#0080FF', 'Active', '2024-09-05'),
  ('NewEra Vibez',     '#FF5555', 'Active', '2024-09-06'),
  ('NewEra AgriToday', '#2B8D2B', 'Active', '2024-09-23'),
  ('Magazines',        '#BF8040', 'Active', '2025-03-11'),
  ('Kundana',          '#000000', 'Active', '2025-11-03')
on conflict (name) do nothing;
