-- ============================================================
-- Create pages table + RLS policies (run in Supabase SQL Editor)
-- Use this if you get "relation public.pages does not exist"
-- ============================================================

-- 1. Create pages table
CREATE TABLE IF NOT EXISTS public.pages (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_date  text        NOT NULL,
    filename      text        NOT NULL,
    storage_path  text,
    page_number   int,
    section       text,
    headline      text,
    tags          jsonb       DEFAULT '[]',
    status        text        NOT NULL DEFAULT 'uploaded',
    uploaded_by   text,
    uploaded_at   timestamptz DEFAULT now(),
    created_at    timestamptz DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS pages_date_idx ON public.pages (edition_date);
CREATE INDEX IF NOT EXISTS pages_uploaded_by_idx ON public.pages (uploaded_by);

-- 3. Enable RLS
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies (so we can recreate without errors)
DROP POLICY IF EXISTS "service role full access pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can read pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can insert pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can update pages" ON public.pages;
DROP POLICY IF EXISTS "authenticated can delete pages" ON public.pages;

-- 5. Create policies
CREATE POLICY "service role full access pages" ON public.pages
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can read pages" ON public.pages
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert pages" ON public.pages
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update pages" ON public.pages
  AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete pages" ON public.pages
  AS PERMISSIVE FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 6. Storage: allow authenticated users to upload/read in Upload bucket
-- (RLS on storage.objects is why you see "new row violates" on upload)
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated upload to Upload bucket" ON storage.objects;
CREATE POLICY "Allow authenticated upload to Upload bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'Upload');

DROP POLICY IF EXISTS "Allow authenticated read Upload bucket" ON storage.objects;
CREATE POLICY "Allow authenticated read Upload bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'Upload');

DROP POLICY IF EXISTS "Allow authenticated update Upload bucket" ON storage.objects;
CREATE POLICY "Allow authenticated update Upload bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'Upload');
