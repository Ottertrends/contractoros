ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invoice_logo_url text,
  ADD COLUMN IF NOT EXISTS invoice_primary_color text DEFAULT '#111827',
  ADD COLUMN IF NOT EXISTS invoice_font text DEFAULT 'helvetica',
  ADD COLUMN IF NOT EXISTS invoice_footer text;

-- Storage bucket for invoice logos (public, max 2 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-logos',
  'invoice-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
