-- ============================================================
-- Fix: "new row violates row-level security policy" on UPLOAD
-- Run in Supabase Dashboard → SQL Editor
--
-- This error often comes from Storage (storage.objects), not the
-- pages table. Add these policies so authenticated users can
-- upload and read files in the "Upload" bucket.
-- ============================================================

-- Upload bucket: allow authenticated users to insert (upload)
DROP POLICY IF EXISTS "Allow authenticated upload to Upload bucket" ON storage.objects;
CREATE POLICY "Allow authenticated upload to Upload bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'Upload');

-- Upload bucket: allow authenticated users to read (download)
DROP POLICY IF EXISTS "Allow authenticated read Upload bucket" ON storage.objects;
CREATE POLICY "Allow authenticated read Upload bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'Upload');

-- Upload bucket: allow authenticated users to update (overwrite)
DROP POLICY IF EXISTS "Allow authenticated update Upload bucket" ON storage.objects;
CREATE POLICY "Allow authenticated update Upload bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'Upload');

-- ============================================================
-- Outputs bucket (for pipeline: merged PDFs, segment PDFs)
-- Create the bucket in Dashboard first: Storage → New bucket → name "outputs"
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated upload to outputs bucket" ON storage.objects;
CREATE POLICY "Allow authenticated upload to outputs bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'outputs');

DROP POLICY IF EXISTS "Allow authenticated read outputs bucket" ON storage.objects;
CREATE POLICY "Allow authenticated read outputs bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'outputs');

DROP POLICY IF EXISTS "Allow authenticated update outputs bucket" ON storage.objects;
CREATE POLICY "Allow authenticated update outputs bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'outputs');
