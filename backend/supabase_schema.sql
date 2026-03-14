-- ============================================================
-- NewEra Editorial System — Supabase Schema
-- Run this once in Supabase Dashboard → SQL Editor
-- ============================================================

-- Editions table: one row per published edition
-- Synced from the local app whenever internet is available.
create table if not exists public.editions (
    id             uuid        primary key default gen_random_uuid(),
    date           text        not null unique,          -- YYYY-MM-DD
    status         text        not null default 'draft',
    expected_pages int         default 24,
    deadline       text        default '15:00',          -- HH:MM
    published_at   text,                                 -- HH:MM:SS
    pages          jsonb,                                -- array of page metadata objects
    sections       jsonb,                                -- { "News": [1,2,3], "Sport": [...], ... }
    outputs        jsonb       not null default '{}',    -- storage keys for output PDFs
    storage_paths  jsonb       default '{}',             -- Supabase Storage object keys after upload
    created_at     timestamptz default now(),
    updated_at     timestamptz default now()
);

-- Index for fast listing by date (descending — latest first)
create index if not exists editions_date_idx
    on public.editions (date desc);

-- Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists editions_set_updated_at on public.editions;
create trigger editions_set_updated_at
    before update on public.editions
    for each row execute function public.set_updated_at();

-- ============================================================
-- Pages table — individual uploaded pages with analysis results
-- ============================================================
create table if not exists public.pages (
    id            uuid        primary key default gen_random_uuid(),
    edition_date  text        not null,              -- YYYY-MM-DD
    filename      text        not null,
    storage_path  text,                              -- Supabase Storage key
    page_number   int,
    section       text,
    headline      text,
    tags          jsonb       default '[]',
    status        text        not null default 'uploaded',  -- uploaded | analysing | analysed | error
    uploaded_by   text,                              -- designer email
    uploaded_at   timestamptz default now(),
    created_at    timestamptz default now()
);

create index if not exists pages_date_idx on public.pages (edition_date);
create index if not exists pages_uploaded_by_idx on public.pages (uploaded_by);

drop trigger if exists pages_set_updated_at on public.pages;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.editions enable row level security;
alter table public.pages enable row level security;

-- Service role full access
create policy "service role full access editions" on public.editions
    as permissive for all to service_role using (true) with check (true);

create policy "service role full access pages" on public.pages
    as permissive for all to service_role using (true) with check (true);

-- Authenticated users can read editions
create policy "authenticated can read editions" on public.editions
    as permissive for select to authenticated using (true);

-- Authenticated users can insert/update editions (pipeline runs from frontend)
create policy "authenticated can write editions" on public.editions
    as permissive for insert to authenticated with check (true);

create policy "authenticated can update editions" on public.editions
    as permissive for update to authenticated using (true) with check (true);

-- Authenticated users: full access to pages
create policy "authenticated can read pages" on public.pages
    as permissive for select to authenticated using (true);

create policy "authenticated can insert pages" on public.pages
    as permissive for insert to authenticated with check (true);

create policy "authenticated can update pages" on public.pages
    as permissive for update to authenticated using (true) with check (true);

create policy "authenticated can delete pages" on public.pages
    as permissive for delete to authenticated using (true);

-- ============================================================
-- Admins table
-- ============================================================
create table if not exists public.admins (
    id         uuid        primary key default gen_random_uuid(),
    email      text        not null unique,
    created_at timestamptz default now()
);

alter table public.admins enable row level security;

create policy "service role full access admins" on public.admins
    as permissive for all to service_role using (true) with check (true);

create policy "authenticated can read admins" on public.admins
    as permissive for select to authenticated using (true);

-- Admins can write to admins table
create policy "admins can write admins" on public.admins
    as permissive for insert to authenticated
    with check (
        exists (select 1 from public.admins where admins.email = auth.jwt()->>'email')
    );

-- ============================================================
-- Designers table
-- ============================================================
create table if not exists public.designers (
    id         uuid        primary key default gen_random_uuid(),
    email      text        not null unique,
    created_at timestamptz default now()
);

alter table public.designers enable row level security;

create policy "service role full access designers" on public.designers
    as permissive for all to service_role using (true) with check (true);

create policy "authenticated can read designers" on public.designers
    as permissive for select to authenticated using (true);

create policy "admins can write designers" on public.designers
    as permissive for insert, update, delete to authenticated
    using (
        exists (select 1 from public.admins where admins.email = auth.jwt()->>'email')
    )
    with check (
        exists (select 1 from public.admins where admins.email = auth.jwt()->>'email')
    );

-- ============================================================
-- Storage buckets — create these manually in the Supabase Dashboard:
--   1. Bucket: "uploads"   (for raw PDF pages)
--   2. Bucket: "outputs"   (for merged output PDFs)
-- Then add storage policies for authenticated users.
-- ============================================================
