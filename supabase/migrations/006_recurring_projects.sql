-- Feature: Calendar & Recurring Projects
CREATE TABLE IF NOT EXISTS public.recurring_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('weekly', 'interval', 'monthly')),
  -- weekly: day_of_week (0=Sun .. 6=Sat)
  day_of_week INTEGER,
  -- interval: every N days
  interval_days INTEGER,
  -- monthly: day of month (1-28)
  day_of_month INTEGER,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_occurrence DATE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.recurring_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recurring_projects" ON public.recurring_projects
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS recurring_projects_user_next ON public.recurring_projects(user_id, next_occurrence);

-- Feature: Notifications toggle
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;
