import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncToStripe, finalizeAndSendStripeInvoice } from "@/lib/invoice/sync-stripe";

/**
 * POST /api/invoices/[id]/send-stripe
 * Finalizes the Stripe invoice and sends it to the client via Stripe email.
 * If no Stripe invoice exists yet, syncs first (creates draft), then finalizes + sends.
 * Returns the hosted_invoice_url so the client can open it in a new tab.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if a Stripe invoice already exists
    const { data: invoice } = await supabase
      .from("invoices")
      .select("stripe_invoice_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const hasStripeInvoice = !!(invoice as Record<string, unknown>).stripe_invoice_id;

    // Sync first if not yet in Stripe (creates draft)
    if (!hasStripeInvoice) {
      await syncToStripe(id, user.id);
    }

    // Finalize + send — returns the hosted_invoice_url
    const hostedUrl = await finalizeAndSendStripeInvoice(id, user.id);

    // Update WorkSupp status to "sent"
    await supabase
      .from("invoices")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ success: true, hosted_url: hostedUrl });
  } catch (err) {
    console.error("[send-stripe]", err);
    const message = err instanceof Error ? err.message : "Failed to send invoice via Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
