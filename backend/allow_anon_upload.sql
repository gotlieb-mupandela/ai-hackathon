-- ============================================================
-- Fix: "new row violates row-level security policy" (same idea
-- as before, but for anon because login was removed)
--
-- 1. Supabase Dashboard → SQL Editor
-- 2. Paste this entire file and click Run
-- 3. If your bucket is lowercase "upload", change 'Upload' to 'upload' in section 3
-- ============================================================

-- 1. PAGES TABLE (same as fix_pages_rls.sql, but for anon)
DROP POLICY IF EXISTS "anon can read pages" ON public.pages;
CREATE POLICY "anon can read pages" ON public.pages
  AS PERMISSIVE FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon can insert pages" ON public.pages;
CREATE POLICY "anon can insert pages" ON public.pages
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon can update pages" ON public.pages;
CREATE POLICY "anon can update pages" ON public.pages
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 2. EDITIONS TABLE (for getOrCreateTodayEdition)
DROP POLICY IF EXISTS "anon can read editions" ON public.editions;
CREATE POLICY "anon can read editions" ON public.editions
  AS PERMISSIVE FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon can insert editions" ON public.editions;
CREATE POLICY "anon can insert editions" ON public.editions
  AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon can update editions" ON public.editions;
CREATE POLICY "anon can update editions" ON public.editions
  AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 3. STORAGE (same as fix_storage_rls.sql, but for anon — this is usually where the error comes from)
-- Bucket name must match exactly: your app uses 'Upload'. If you created the bucket as 'upload', use that.
DROP POLICY IF EXISTS "Allow anon upload to Upload bucket" ON storage.objects;
CREATE POLICY "Allow anon upload to Upload bucket"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'Upload');

DROP POLICY IF EXISTS "Allow anon read Upload bucket" ON storage.objects;
CREATE POLICY "Allow anon read Upload bucket"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'Upload');

DROP POLICY IF EXISTS "Allow anon update Upload bucket" ON storage.objects;
CREATE POLICY "Allow anon update Upload bucket"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'Upload');
