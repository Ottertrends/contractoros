-- Google integrations (server stores encrypted refresh token; RLS: user owns row)
CREATE TABLE IF NOT EXISTS public.user_google_integrations (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email TEXT,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  refresh_token_tag TEXT NOT NULL,
  calendar_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_google_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google integration"
  ON public.user_google_integrations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own google integration"
  ON public.user_google_integrations FOR DELETE USING (auth.uid() = user_id);

-- Insert/update only via service role in API routes (no INSERT/UPDATE for authenticated)

-- Stripe Connect (contractor receives payments on their account)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN,
  ADD COLUMN IF NOT EXISTS default_alternate_payment_instructions TEXT,
  ADD COLUMN IF NOT EXISTS default_zelle_info TEXT,
  ADD COLUMN IF NOT EXISTS default_venmo_handle TEXT;

-- Recurring → Google Calendar mapping
ALTER TABLE public.recurring_projects
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect ON public.profiles(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

-- Invoice: contractor payment link + lower-fee instructions
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS alternate_payment_instructions TEXT,
  ADD COLUMN IF NOT EXISTS pay_with_ach_enabled BOOLEAN DEFAULT false;
