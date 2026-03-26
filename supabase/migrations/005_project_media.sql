-- Table for media (images/videos) attached to projects via WhatsApp
CREATE TABLE public.project_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT,
  description TEXT,
  whatsapp_message_id TEXT,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own media"
  ON public.project_media FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX project_media_user_id_idx ON public.project_media (user_id);
CREATE INDEX project_media_project_id_idx ON public.project_media (project_id);

CREATE TRIGGER update_project_media_updated_at
  BEFORE UPDATE ON public.project_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Storage bucket: project-media (private, 50MB limit)
-- Created separately via Supabase dashboard or execute_sql on storage.buckets

-- Storage RLS policies (migration 006)
