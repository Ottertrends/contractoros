-- 028: Add share_token to invoices for public invoice preview links

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS invoices_share_token_idx ON invoices(share_token);

-- Public read policy: anyone with the token can view the invoice
DROP POLICY IF EXISTS "Public can view shared invoices" ON invoices;
CREATE POLICY "Public can view shared invoices"
  ON invoices FOR SELECT
  USING (share_token IS NOT NULL);
