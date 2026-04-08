import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncToStripe, finalizeStripeInvoice } from "@/lib/invoice/sync-stripe";

/**
 * POST /api/invoices/[id]/finalize
 * Finalizes a draft invoice → moves it to "open" status.
 * If Stripe is connected, also finalizes the Stripe invoice (creating hosted_invoice_url).
 * If Stripe is not connected, just updates the local status to "open".
 * Returns { success: true, hosted_url } where hosted_url may be null for non-Stripe users.
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
    // Fetch invoice + profile together
    const [{ data: invoice }, { data: profile }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, status, stripe_invoice_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("profiles")
        .select("stripe_connect_account_id, stripe_connect_charges_enabled")
        .eq("id", user.id)
        .single(),
    ]);

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if ((invoice as Record<string, unknown>).status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be finalized" },
        { status: 400 },
      );
    }

    const stripeConnected = !!(profile as Record<string, unknown> | null)
      ?.stripe_connect_charges_enabled;

    let hostedUrl: string | null = null;

    if (stripeConnected) {
      // Sync to Stripe if no Stripe invoice exists yet
      const hasStripeInvoice = !!(invoice as Record<string, unknown>).stripe_invoice_id;
      if (!hasStripeInvoice) {
        await syncToStripe(id, user.id);
      }

      // Finalize: draft → open in Stripe, generates hosted_invoice_url
      hostedUrl = await finalizeStripeInvoice(id, user.id);
    }

    // Update WorkSupp status to "open"
    await supabase
      .from("invoices")
      .update({
        status: "open",
        ...(hostedUrl ? { stripe_hosted_url: hostedUrl } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ success: true, hosted_url: hostedUrl });
  } catch (err) {
    console.error("[finalize]", err);
    const message =
      err instanceof Error ? err.message : "Failed to finalize invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
