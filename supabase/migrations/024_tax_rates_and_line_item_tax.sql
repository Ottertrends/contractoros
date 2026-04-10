-- User-saved named tax rates
CREATE TABLE IF NOT EXISTS public.tax_rates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  rate               NUMERIC(5,2) NOT NULL,
  stripe_tax_rate_id TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_rates_owner" ON public.tax_rates
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Per-line-item tax rate on invoice items
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0;
