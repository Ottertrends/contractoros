import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendOpenStripeInvoice } from "@/lib/invoice/sync-stripe";

/**
 * POST /api/invoices/[id]/send-stripe
 * Sends an already-finalized (open) Stripe invoice to the client via Stripe email.
 * The invoice must already be in "open" status (i.e. finalized via /finalize first).
 * Returns { success: true, hosted_url } so the client can open it in a new tab.
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
      .select("stripe_invoice_id, stripe_hosted_url")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Send invoice via Stripe — returns the hosted_invoice_url
    const hostedUrl = await sendOpenStripeInvoice(id, user.id);

    // Update invoice status to "sent" in WorkSupp
    await supabase
      .from("invoices")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ success: true, hosted_url: hostedUrl });
  } catch (err) {
    console.error("[send-stripe]", err);
    const message =
      err instanceof Error ? err.message : "Failed to send invoice via Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
