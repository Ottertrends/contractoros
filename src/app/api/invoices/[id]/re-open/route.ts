import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncToStripe, finalizeStripeInvoice } from "@/lib/invoice/sync-stripe";

const MAX_OPEN_EDITS = 3;

/**
 * POST /api/invoices/[id]/re-open
 * For open invoices: voids the current Stripe invoice, re-syncs with latest
 * line items, and immediately re-finalizes to a new open Stripe invoice.
 * Limited to MAX_OPEN_EDITS (3) re-creations per invoice.
 * Returns { success, hosted_url, stripe_invoice_number, open_edit_count }.
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
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status, open_edit_count")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const inv = invoice as Record<string, unknown>;

    if (inv.status !== "open") {
      return NextResponse.json(
        { error: "Only open invoices can be re-opened." },
        { status: 400 },
      );
    }

    const currentCount = (inv.open_edit_count as number) ?? 0;
    if (currentCount >= MAX_OPEN_EDITS) {
      return NextResponse.json(
        {
          error: `You've reached the ${MAX_OPEN_EDITS}-edit limit on this open invoice. Please void it and create a new one.`,
        },
        { status: 400 },
      );
    }

    // Re-sync: voids old Stripe invoice + creates new draft with latest data
    const syncResult = await syncToStripe(id, user.id);

    // Immediately finalize the new draft → back to open
    const { hostedUrl, invoiceNumber } = await finalizeStripeInvoice(id, user.id);

    const newCount = currentCount + 1;

    await supabase
      .from("invoices")
      .update({
        open_edit_count: newCount,
        stripe_hosted_url: hostedUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      hosted_url: hostedUrl,
      stripe_invoice_number: invoiceNumber,
      stripe_invoice_id: syncResult.stripe_invoice_id,
      open_edit_count: newCount,
    });
  } catch (err) {
    console.error("[re-open]", err);
    const message = err instanceof Error ? err.message : "Failed to re-open invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
