-- Migration: add client_email to projects table
-- Stores the billing/contact email for the client associated with a project.
-- Used to send Stripe invoices directly and pre-fill email dialogs.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_email TEXT;
