import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, stripe_customer_id, full_name, email")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_plan === "free") {
    return NextResponse.json({ error: "Admin-granted free access — no payment needed." }, { status: 400 });
  }

  // Get or create Stripe customer
  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://worksup.vercel.app";

  // Apply discount coupon if discounted plan
  const discounts =
    profile?.subscription_plan === "discounted" && process.env.STRIPE_DISCOUNT_COUPON_ID
      ? [{ coupon: process.env.STRIPE_DISCOUNT_COUPON_ID }]
      : [];

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    automatic_tax: { enabled: true },
    customer_update: { address: "auto" },
    discounts: discounts.length ? discounts : undefined,
    success_url: `${appUrl}/dashboard/billing?success=1`,
    cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
    metadata: { supabase_user_id: user.id },
  });

  return NextResponse.json({ url: session.url });
}
