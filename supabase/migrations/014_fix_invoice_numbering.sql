-- ─────────────────────────────────────────────────────────────────────────────
-- 014 · Fix invoice numbering: use MAX()+1 instead of COUNT()+1
-- COUNT()-based numbering creates duplicates when invoices are deleted/cancelled.
-- MAX() always picks the highest existing number, guaranteeing uniqueness.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_draft_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id UUID;
  v_inv_count  INT;
  v_inv_num    TEXT;
  v_quoted     NUMERIC(12,2);
BEGIN
  v_quoted := COALESCE(NEW.quoted_amount, 0);

  SELECT id INTO v_invoice_id
    FROM public.invoices
   WHERE project_id = NEW.id AND status = 'draft'
   LIMIT 1;

  -- CREATE ──────────────────────────────────────────────────────────────────
  IF v_invoice_id IS NULL THEN
    -- Use MAX of numeric suffix to avoid duplicates when invoices are deleted
    SELECT COALESCE(MAX(
      CASE WHEN invoice_number ~ '\d+$'
        THEN CAST(substring(invoice_number FROM '\d+$') AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO v_inv_count
    FROM public.invoices WHERE user_id = NEW.user_id;

    v_inv_num := 'INV-' || LPAD(v_inv_count::TEXT, 3, '0');

    INSERT INTO public.invoices (
      project_id, user_id, invoice_number, status,
      subtotal, tax_rate, tax_amount, total, notes, date
    ) VALUES (
      NEW.id, NEW.user_id, v_inv_num, 'draft',
      v_quoted, 0, 0, v_quoted, NEW.notes, CURRENT_DATE
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (
      invoice_id, name, description, quantity, unit_price, total, sort_order
    ) VALUES (
      v_invoice_id,
      NEW.name,
      COALESCE(NEW.current_work, NEW.name),
      1, v_quoted, v_quoted, 0
    );

  -- SYNC ────────────────────────────────────────────────────────────────────
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.quoted_amount IS DISTINCT FROM NEW.quoted_amount OR
    OLD.current_work  IS DISTINCT FROM NEW.current_work  OR
    OLD.name          IS DISTINCT FROM NEW.name          OR
    OLD.notes         IS DISTINCT FROM NEW.notes
  ) THEN
    UPDATE public.invoices
       SET subtotal   = v_quoted,
           tax_amount = ROUND(v_quoted * tax_rate, 2),
           total      = v_quoted + ROUND(v_quoted * tax_rate, 2),
           notes      = COALESCE(NEW.notes, notes),
           updated_at = NOW()
     WHERE id = v_invoice_id;

    UPDATE public.invoice_items
       SET name        = NEW.name,
           description = COALESCE(NULLIF(NEW.current_work,''), description),
           unit_price  = v_quoted,
           total       = ROUND(quantity::NUMERIC * v_quoted, 2)
     WHERE invoice_id = v_invoice_id AND sort_order = 0;

    INSERT INTO public.invoice_items (
      invoice_id, name, description, quantity, unit_price, total, sort_order
    )
    SELECT v_invoice_id, NEW.name, COALESCE(NEW.current_work, NEW.name), 1, v_quoted, v_quoted, 0
    WHERE NOT EXISTS (
      SELECT 1 FROM public.invoice_items
       WHERE invoice_id = v_invoice_id AND sort_order = 0
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
