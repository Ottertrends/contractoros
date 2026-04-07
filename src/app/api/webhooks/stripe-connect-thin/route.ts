import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServerClient } from "@supabase/ssr";

/**
 * POST /api/webhooks/stripe-connect-thin
 * Thin webhook — receives account lifecycle events for connected accounts.
 * Handles: account.updated → update profile stripe_connect_charges_enabled + details_submitted
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_CONNECT_THIN_SECRET;
  if (!webhookSecret) {
    console.error("[thin-webhook] Missing STRIPE_CONNECT_THIN_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[thin-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "account.updated") {
    const acct = event.data.object as {
      id: string;
      charges_enabled: boolean;
      details_submitted: boolean;
    };

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } },
    );

    const { error } = await supabase
      .from("profiles")
      .update({
        stripe_connect_charges_enabled: acct.charges_enabled,
        stripe_connect_details_submitted: acct.details_submitted,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_connect_account_id", acct.id);

    if (error) {
      console.error("[thin-webhook] Failed to update profile:", error);
    } else {
      console.log(
        `[thin-webhook] Profile updated for account ${acct.id}: charges_enabled=${acct.charges_enabled}`,
      );
    }
  }

  return NextResponse.json({ received: true });
}
