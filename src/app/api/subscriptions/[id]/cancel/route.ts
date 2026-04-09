import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/subscriptions/[id]/cancel
 * Cancels a client subscription immediately.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("client_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  const record = sub as Record<string, unknown>;

  if (record.status === "canceled") {
    return NextResponse.json({ error: "Subscription is already canceled" }, { status: 400 });
  }

  // Cancel in Stripe if we have a subscription ID
  const stripeSubId = record.stripe_subscription_id as string | null;
  if (stripeSubId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", user.id)
      .single();

    const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
    if (connectedAccountId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(stripeSubId, {}, { stripeAccount: connectedAccountId });
      } catch (err) {
        console.error("[subscriptions/cancel] Stripe cancel error:", err);
        // Still update locally even if Stripe call fails
      }
    }
  }

  await supabase
    .from("client_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
