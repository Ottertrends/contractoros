-- ============================================================
-- MANUAL MIGRATIONS — Apply these in Supabase SQL Editor
-- ============================================================

-- 1. Add city/state/zip columns to clients table (migration 010)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS zip text;

-- 2. Fix logo upload RLS policies for invoice-logos storage bucket
--    Drop old policies first (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Authenticated users can upload invoice logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view invoice logos" ON storage.objects;
DROP POLICY IF EXISTS "invoice_logos_insert" ON storage.objects;
DROP POLICY IF EXISTS "invoice_logos_update" ON storage.objects;
DROP POLICY IF EXISTS "invoice_logos_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice_logos_delete" ON storage.objects;

CREATE POLICY "invoice_logos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-logos');

CREATE POLICY "invoice_logos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-logos')
  WITH CHECK (bucket_id = 'invoice-logos');

CREATE POLICY "invoice_logos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoice-logos');

CREATE POLICY "invoice_logos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-logos');
