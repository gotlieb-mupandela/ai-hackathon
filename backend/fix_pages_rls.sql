-- ============================================================
-- Fix: "new row violates row-level security policy" on pages
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop existing policies (ignore errors if they don't exist)
DROP POLICY IF EXISTS "authenticated can read pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can insert pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can update pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can delete pages" ON public.pages;

-- Recreate: allow authenticated users full access to pages
CREATE POLICY "authenticated can read pages" ON public.pages
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert pages" ON public.pages
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update pages" ON public.pages
  AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete pages" ON public.pages
  AS PERMISSIVE FOR DELETE TO authenticated USING (true);
