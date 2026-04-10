import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { voidStripeInvoice } from "@/lib/invoice/sync-stripe";

/**
 * POST /api/invoices/[id]/void
 * Voids an open (or draft) invoice:
 * 1. Voids the Stripe invoice if one exists (silently).
 * 2. Updates local status to "void" and clears Stripe fields.
 * 3. Creates a new blank draft invoice for the same project.
 * Returns { success: true, new_invoice_id }.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch invoice with all fields needed to clone into new draft
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, project_id, status, stripe_invoice_id, date, notes, subtotal, tax_rate, tax_amount, total, automatic_tax_enabled")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const inv = invoice as Record<string, unknown>;
    const projectId = inv.project_id as string;

    // Fetch existing line items so we can copy them to the new draft (include per-line tax_rate)
    const { data: existingItems } = await supabase
      .from("invoice_items")
      .select("name, description, quantity, unit_price, total, tax_rate, sort_order")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true });

    // Void Stripe invoice silently (handles errors internally)
    await voidStripeInvoice(id, user.id);

    // Mark invoice as void in WorkSupp, clear Stripe fields
    await supabase
      .from("invoices")
      .update({
        status: "void",
        stripe_invoice_id: null,
        stripe_hosted_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    // Generate next invoice number
    const { data: allNums } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("user_id", user.id);

    const maxNum = (allNums ?? []).reduce((max, inv) => {
      const match = ((inv as Record<string, unknown>).invoice_number as string ?? "").match(/(\d+)$/);
      const n = match ? parseInt(match[1], 10) : 0;
      return Math.max(max, n);
    }, 0);

    const newInvoiceNumber = `INV-${String(maxNum + 1).padStart(3, "0")}`;

    // Create new draft for the same project, copying all editable fields from the voided invoice
    const { data: newInvoice, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        project_id: projectId,
        user_id: user.id,
        invoice_number: newInvoiceNumber,
        status: "draft",
        date: (inv.date as string | null) ?? new Date().toISOString().slice(0, 10),
        notes: (inv.notes as string | null) ?? null,
        subtotal: (inv.subtotal as string | null) ?? "0",
        tax_rate: (inv.tax_rate as string | null) ?? "0",
        tax_amount: (inv.tax_amount as string | null) ?? "0",
        total: (inv.total as string | null) ?? "0",
        automatic_tax_enabled: (inv.automatic_tax_enabled as boolean | null) ?? false,
      })
      .select("id")
      .single();

    if (insertErr || !newInvoice) {
      console.error("[void] Failed to create new draft:", insertErr?.message);
      return NextResponse.json({ success: true, new_invoice_id: null });
    }

    const newInvoiceId = (newInvoice as Record<string, unknown>).id as string;

    // Copy line items to the new draft
    if (existingItems && existingItems.length > 0) {
      await supabase.from("invoice_items").insert(
        (existingItems as Array<Record<string, unknown>>).map((item, idx) => ({
          invoice_id: newInvoiceId,
          name: item.name as string | null,
          description: item.description as string | null,
          quantity: item.quantity as string,
          unit_price: item.unit_price as string,
          total: item.total as string,
          tax_rate: (item.tax_rate as number | null) ?? 0,
          sort_order: (item.sort_order as number | null) ?? idx,
        })),
      );
    }

    return NextResponse.json({
      success: true,
      new_invoice_id: newInvoiceId,
    });
  } catch (err) {
    console.error("[void]", err);
    const message = err instanceof Error ? err.message : "Failed to void invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
