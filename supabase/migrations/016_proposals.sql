-- Proposals: saved AI-generated quotes
CREATE TABLE IF NOT EXISTS proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_name TEXT,
  scope TEXT,
  terms TEXT,
  valid_until DATE,
  line_items JSONB NOT NULL DEFAULT '[]',
  content_blocks JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  company_name TEXT,
  company_email TEXT,
  company_phone TEXT,
  project_name TEXT,
  design JSONB,
  share_token TEXT UNIQUE,
  pdf_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposals_user ON proposals(user_id);
CREATE INDEX idx_proposals_project ON proposals(project_id);
CREATE INDEX idx_proposals_share ON proposals(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposals_select ON proposals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY proposals_insert ON proposals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY proposals_update ON proposals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY proposals_delete ON proposals FOR DELETE USING (auth.uid() = user_id);

-- Proposal templates: reusable scope/terms
CREATE TABLE IF NOT EXISTS proposal_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope_template TEXT,
  terms_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_templates_user ON proposal_templates(user_id);

ALTER TABLE proposal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_select ON proposal_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY templates_insert ON proposal_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY templates_update ON proposal_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY templates_delete ON proposal_templates FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for shared proposal PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-pdfs', 'proposal-pdfs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY proposal_pdfs_read ON storage.objects
  FOR SELECT USING (bucket_id = 'proposal-pdfs');

CREATE POLICY proposal_pdfs_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'proposal-pdfs' AND auth.uid() IS NOT NULL);

CREATE POLICY proposal_pdfs_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'proposal-pdfs' AND auth.uid() IS NOT NULL);
