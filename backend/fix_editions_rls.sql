-- ============================================================
-- Fix: 403 Forbidden on /rest/v1/editions
-- Run in Supabase Dashboard → SQL Editor
--
-- Creates editions table if missing and ensures authenticated
-- users can SELECT, INSERT, and UPDATE.
-- ============================================================

-- 1. Create editions table if not exists
CREATE TABLE IF NOT EXISTS public.editions (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    date           text        NOT NULL UNIQUE,
    status         text        NOT NULL DEFAULT 'draft',
    expected_pages int         DEFAULT 24,
    deadline       text        DEFAULT '15:00',
    published_at   text,
    pages          jsonb,
    sections       jsonb,
    outputs        jsonb       NOT NULL DEFAULT '{}',
    storage_paths  jsonb       DEFAULT '{}',
    created_at     timestamptz DEFAULT now(),
    updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editions_date_idx ON public.editions (date DESC);

-- 2. Enable RLS
ALTER TABLE public.editions ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies (avoid duplicate policy errors)
DROP POLICY IF EXISTS "service role full access editions" ON public.editions;
DROP POLICY IF EXISTS "authenticated can read editions" ON public.editions;
DROP POLICY IF EXISTS "authenticated can write editions" ON public.editions;
DROP POLICY IF EXISTS "authenticated can update editions" ON public.editions;

-- 4. Create policies
CREATE POLICY "service role full access editions" ON public.editions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can read editions" ON public.editions
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can write editions" ON public.editions
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update editions" ON public.editions
  AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
