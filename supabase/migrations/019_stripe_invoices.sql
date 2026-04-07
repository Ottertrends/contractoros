-- Stripe Invoices API columns for hosted invoice URL and automatic tax
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_hosted_url TEXT,
  ADD COLUMN IF NOT EXISTS automatic_tax_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id ON public.invoices(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
