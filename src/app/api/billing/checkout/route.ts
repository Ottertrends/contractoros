import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { normalizePlan } from "@/lib/billing/access";

const PRICE_MAP: Record<string, Record<string, string>> = {
  premium: {
    monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY ?? process.env.STRIPE_PRICE_ID ?? "",
    annual: process.env.STRIPE_PRICE_PREMIUM_ANNUAL ?? process.env.STRIPE_PRICE_ID ?? "",
  },
  premium_team: {
    monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_TEAM_ANNUAL ?? "",
  },
};

const SEAT_PRICE_MAP: Record<string, string> = {
  monthly: process.env.STRIPE_PRICE_SEAT_MONTHLY ?? "",
  annual: process.env.STRIPE_PRICE_SEAT_ANNUAL ?? "",
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestedPlan: string = body.plan ?? "premium"; // "premium" | "premium_team"
  const interval: string = body.interval ?? "monthly";  // "monthly" | "annual"
  const extraSeats: number = Math.max(0, parseInt(body.extra_seats ?? "0", 10));

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, stripe_customer_id, full_name, email")
    .eq("id", user.id)
    .single();

  const normalizedPlan = normalizePlan(profile?.subscription_plan);

  // Admin-granted free plans don't need checkout
  if (normalizedPlan === "free_premium" || normalizedPlan === "free_premium_team") {
    return NextResponse.json({ error: "Admin-granted free access — no payment needed." }, { status: 400 });
  }

  // Get or create Stripe customer
  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: profile?.email ?? user.email,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://worksup.vercel.app").replace(/\/$/, "");

  // Build line items
  const basePriceId = PRICE_MAP[requestedPlan]?.[interval];
  if (!basePriceId) {
    return NextResponse.json({ error: "Invalid plan or interval." }, { status: 400 });
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: basePriceId, quantity: 1 },
  ];
  if (extraSeats > 0 && SEAT_PRICE_MAP[interval]) {
    lineItems.push({ price: SEAT_PRICE_MAP[interval], quantity: extraSeats });
  }

  // Apply 50% coupon for discounted plans
  const isDiscounted = normalizedPlan === "discounted_premium" || normalizedPlan === "discounted_premium_team";
  const discounts =
    isDiscounted && process.env.STRIPE_COUPON_50PCT
      ? [{ coupon: process.env.STRIPE_COUPON_50PCT }]
      : [];

  // Legacy promo code support
  const legacyDiscounts =
    !isDiscounted && normalizedPlan === "discounted_premium" && process.env.STRIPE_PROMO_ID
      ? [{ promotion_code: process.env.STRIPE_PROMO_ID }]
      : [];

  const appliedDiscounts = discounts.length ? discounts : legacyDiscounts;

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: lineItems,
    automatic_tax: { enabled: true },
    customer_update: { address: "auto" },
    ...(appliedDiscounts.length
      ? { discounts: appliedDiscounts }
      : { allow_promotion_codes: true }),
    success_url: `${appUrl}/dashboard/billing?success=1`,
    cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
    metadata: {
      supabase_user_id: user.id,
      plan: requestedPlan,
      interval,
      extra_seats: String(extraSeats),
    },
  });

  return NextResponse.json({ url: session.url });
}
