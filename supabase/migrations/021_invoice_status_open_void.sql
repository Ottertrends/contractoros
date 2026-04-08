-- 021_invoice_status_open_void.sql
-- Extend the invoices status CHECK constraint to include Stripe lifecycle states.
-- Keeps 'sent' and 'cancelled' for backward compatibility.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'open', 'sent', 'paid', 'void', 'uncollectible', 'cancelled'));
