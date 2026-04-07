import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServerClient } from "@supabase/ssr";

/**
 * POST /api/webhooks/stripe-connect-snapshot
 * Snapshot webhook — receives events from connected accounts via Stripe Connect.
 * Handles: invoice.paid → update invoice status to 'paid'
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_CONNECT_SNAPSHOT_SECRET;
  if (!webhookSecret) {
    console.error("[snapshot-webhook] Missing STRIPE_CONNECT_SNAPSHOT_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[snapshot-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const stripeInvoice = event.data.object as { id: string; metadata?: { worksupp_invoice_id?: string } };
    const worksuppInvoiceId = stripeInvoice.metadata?.worksupp_invoice_id;

    if (worksuppInvoiceId) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll: () => [], setAll: () => {} } },
      );

      const { error } = await supabase
        .from("invoices")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("id", worksuppInvoiceId);

      if (error) {
        console.error("[snapshot-webhook] Failed to update invoice status:", error);
      } else {
        console.log(`[snapshot-webhook] Invoice ${worksuppInvoiceId} marked as paid`);
      }
    }
  }

  return NextResponse.json({ received: true });
}
