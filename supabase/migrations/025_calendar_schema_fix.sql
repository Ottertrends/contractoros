-- Fix recurring_projects schema:
-- 1. Make project_id nullable (support "no project" internal schedules)
-- 2. Add missing columns referenced by application code
-- 3. Extend recurrence_type CHECK to include 'manual'

ALTER TABLE public.recurring_projects
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.recurring_projects
  ADD COLUMN IF NOT EXISTS manual_dates TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS event_time TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.recurring_projects
  DROP CONSTRAINT IF EXISTS recurring_projects_recurrence_type_check;
ALTER TABLE public.recurring_projects
  ADD CONSTRAINT recurring_projects_recurrence_type_check
  CHECK (recurrence_type IN ('weekly', 'interval', 'monthly', 'manual'));
