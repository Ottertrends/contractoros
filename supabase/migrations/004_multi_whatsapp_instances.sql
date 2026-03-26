-- Second Evolution instance per user + per-instance owner JID/LID (JSONB)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_secondary_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_secondary_connected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_sessions JSONB DEFAULT '{}'::jsonb;

-- Used by webhook self-chat logic (may be missing on DBs that only ran 001)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_owner_jid TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_owner_lid TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_lid_pending BOOLEAN DEFAULT false;
