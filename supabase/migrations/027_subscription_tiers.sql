-- 027: Subscription tiers — team_members, seats, billing interval, workspace helper

-- 1. Add subscription_seats and billing_interval to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_seats INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_billing_interval TEXT DEFAULT 'monthly'
    CHECK (subscription_billing_interval IN ('monthly', 'annual'));

-- 2. Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_email TEXT NOT NULL,
  invited_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'removed')),
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin')),
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (owner_user_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_team_members_owner ON public.team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON public.team_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.team_members(invited_email);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage team" ON public.team_members
  FOR ALL USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Member can view own row" ON public.team_members
  FOR SELECT USING (auth.uid() = member_user_id);

-- 3. Helper function: resolve the workspace owner for a given user
CREATE OR REPLACE FUNCTION public.get_workspace_owner_id(p_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT owner_user_id FROM public.team_members
     WHERE member_user_id = p_user_id AND status = 'active'
     LIMIT 1),
    p_user_id
  );
$$;
