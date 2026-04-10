import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * GET /api/tax-rates
 * Returns all tax rates for the logged-in user.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("tax_rates")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tax_rates: data ?? [] });
}

/**
 * POST /api/tax-rates
 * Creates a new tax rate. Syncs to Stripe if Stripe Connect is configured.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name: string; rate: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, rate } = body;
  if (!name?.trim() || typeof rate !== "number" || rate <= 0 || rate > 100) {
    return NextResponse.json({ error: "name and rate (0–100) are required" }, { status: 400 });
  }

  // Try to sync to Stripe if connected
  let stripeRateId: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", user.id)
      .single();

    const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
    const chargesEnabled = (profile as Record<string, unknown> | null)?.stripe_connect_charges_enabled as boolean | null;

    if (connectedAccountId && chargesEnabled) {
      const stripe = getStripe();
      const stripeTaxRate = await stripe.taxRates.create(
        { display_name: name.trim(), percentage: rate, inclusive: false },
        { stripeAccount: connectedAccountId },
      );
      stripeRateId = stripeTaxRate.id;
    }
  } catch (err) {
    console.warn("[tax-rates] Stripe sync failed (non-fatal):", err);
  }

  const { data, error } = await supabase
    .from("tax_rates")
    .insert({
      user_id: user.id,
      name: name.trim(),
      rate,
      stripe_tax_rate_id: stripeRateId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tax_rate: data });
}
