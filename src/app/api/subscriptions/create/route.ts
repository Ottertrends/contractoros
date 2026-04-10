import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { TAX_CODE_MAP } from "@/lib/subscriptions/tax-codes";
import type { TaxCategory } from "@/lib/types/database";

/**
 * POST /api/subscriptions/create
 * Creates a Stripe Checkout session (subscription mode) on the contractor's
 * connected Stripe account and saves the plan + pending subscription record.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled, company_name")
    .eq("id", user.id)
    .single();

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  const chargesEnabled = (profile as Record<string, unknown> | null)?.stripe_connect_charges_enabled as boolean | null;

  if (!connectedAccountId || !chargesEnabled) {
    return NextResponse.json(
      { error: "Stripe Connect not configured. Please connect your Stripe account first." },
      { status: 403 },
    );
  }

  let body: {
    project_id?: string | null;
    name: string;
    description?: string;
    amount: number;
    interval: "week" | "month";
    setup_fee?: number;
    trial_period_days?: number;
    tax_category?: TaxCategory;
    custom_tax_amount?: number;
  };

  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    project_id = null,
    name,
    description,
    amount,
    interval,
    setup_fee = 0,
    trial_period_days = 0,
    tax_category,
    custom_tax_amount = 0,
  } = body;

  if (!name || !amount || amount < 0.50 || !interval) {
    return NextResponse.json({ error: "Missing required fields (name, amount ≥ $0.50, interval)" }, { status: 400 });
  }

  // Fetch project for client info if a project_id was provided
  let project: { id: string; name: string; client_name: string | null; client_email: string | null } | null = null;
  if (project_id) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, client_name, client_email")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    if (!data) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    project = data as unknown as typeof project;
  }

  const stripe = getStripe();
  const stripeOpts = { stripeAccount: connectedAccountId };
  const origin = req.headers.get("origin") ?? "https://app.worksupp.com";

  const isFixedTax = tax_category === "other" && custom_tax_amount > 0;
  const isAutoTax = !!tax_category && tax_category !== "other";

  try {
    // 1. Create Stripe Product (no tax_code for fixed-amount "other" tax)
    const product = await stripe.products.create(
      {
        name,
        description: description ?? undefined,
        tax_code: tax_category ? TAX_CODE_MAP[tax_category] : undefined,
      },
      stripeOpts,
    );

    // 2. Create recurring Price
    const recurringPrice = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: Math.round(amount * 100),
        currency: "usd",
        recurring: { interval },
      },
      stripeOpts,
    );

    // 3. Optional one-time setup fee price
    let setupFeePrice: { id: string } | null = null;
    if (setup_fee > 0) {
      setupFeePrice = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: Math.round(setup_fee * 100),
          currency: "usd",
        },
        stripeOpts,
      );
    }

    // 4. For fixed-amount tax: create a Stripe TaxRate with the calculated percentage
    //    (percentage = custom_tax_amount / amount * 100, applied to each recurring invoice)
    let fixedTaxRateIds: string[] = [];
    if (isFixedTax) {
      const pct = Math.round((custom_tax_amount / amount) * 10000) / 100; // 2 decimal places
      const taxRate = await stripe.taxRates.create(
        {
          display_name: "Tax",
          percentage: pct,
          inclusive: false,
        },
        stripeOpts,
      );
      fixedTaxRateIds = [taxRate.id];
    }

    // 5. Create Checkout session (subscription mode)
    // NOTE: customer_update requires a pre-existing `customer` ID — cannot use with customer_email.
    // For auto-tax, we use billing_address_collection: "required" so Stripe collects the address.
    const clientEmail = (project as Record<string, unknown> | null)?.client_email as string | undefined ?? undefined;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer_email: clientEmail,
        line_items: [
          { price: recurringPrice.id, quantity: 1 },
          ...(setupFeePrice ? [{ price: setupFeePrice.id, quantity: 1 }] : []),
        ],
        subscription_data: {
          trial_period_days: trial_period_days > 0 ? trial_period_days : undefined,
          default_tax_rates: fixedTaxRateIds.length > 0 ? fixedTaxRateIds : undefined,
          metadata: {
            ...(project_id ? { project_id } : {}),
            contractor_user_id: user.id,
          },
        },
        // Auto-tax: let Stripe calculate based on client location (address required at checkout)
        automatic_tax: { enabled: isAutoTax },
        // Collect billing address when auto-tax is on (replaces customer_update which needs customer ID)
        billing_address_collection: isAutoTax ? "required" : "auto",
        metadata: {
          ...(project_id ? { project_id } : {}),
          contractor_user_id: user.id,
          internal: "client_subscription",
        },
        success_url: `${origin}/dashboard/subscriptions?success=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/dashboard/subscriptions`,
      },
      stripeOpts,
    );

    // 6. Save service plan
    const { data: plan, error: planErr } = await supabase
      .from("service_plans")
      .insert({
        user_id: user.id,
        project_id: project_id ?? null,
        name,
        description: description ?? null,
        amount: String(amount),
        interval,
        setup_fee: String(setup_fee),
        trial_period_days,
        tax_category: tax_category ?? null,
        custom_tax_amount: isFixedTax ? custom_tax_amount : null,
        stripe_product_id: product.id,
        stripe_price_id: recurringPrice.id,
        stripe_checkout_url: session.url,
      })
      .select("id")
      .single();

    if (planErr || !plan) {
      console.error("[subscriptions/create] plan insert error:", planErr?.message);
      return NextResponse.json({ error: "Failed to save plan" }, { status: 500 });
    }

    const planId = (plan as Record<string, unknown>).id as string;

    // 7. Pre-create a pending subscription record ONLY when linked to a specific project.
    //    For shared (project-free) plans, the webhook will create records per paying client.
    let subId: string | null = null;
    if (project_id) {
      const { data: sub, error: subErr } = await supabase
        .from("client_subscriptions")
        .insert({
          user_id: user.id,
          project_id,
          service_plan_id: planId,
          stripe_checkout_session_id: session.id,
          status: "incomplete",
        })
        .select("id")
        .single();

      if (subErr) {
        console.error("[subscriptions/create] subscription insert error:", subErr.message);
      } else {
        subId = sub ? (sub as Record<string, unknown>).id as string : null;
      }
    }

    return NextResponse.json({
      success: true,
      checkout_url: session.url,
      service_plan_id: planId,
      client_subscription_id: subId,
    });
  } catch (err) {
    console.error("[subscriptions/create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create subscription" },
      { status: 500 },
    );
  }
}
