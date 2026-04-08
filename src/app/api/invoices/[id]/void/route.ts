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
    // Fetch invoice to get project_id
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, project_id, status, stripe_invoice_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const projectId = (invoice as Record<string, unknown>).project_id as string;

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

    // Create new blank draft for the same project
    const { data: newInvoice, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        project_id: projectId,
        user_id: user.id,
        invoice_number: newInvoiceNumber,
        status: "draft",
        subtotal: "0",
        tax_rate: "0",
        tax_amount: "0",
        total: "0",
        date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    if (insertErr || !newInvoice) {
      console.error("[void] Failed to create new draft:", insertErr?.message);
      // Still return success for the void — draft creation is best-effort
      return NextResponse.json({ success: true, new_invoice_id: null });
    }

    return NextResponse.json({
      success: true,
      new_invoice_id: (newInvoice as Record<string, unknown>).id,
    });
  } catch (err) {
    console.error("[void]", err);
    const message = err instanceof Error ? err.message : "Failed to void invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
