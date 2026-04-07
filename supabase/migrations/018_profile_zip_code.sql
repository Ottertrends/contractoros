-- Add zip_code to profiles for AI personalization and service area targeting
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zip_code TEXT;
