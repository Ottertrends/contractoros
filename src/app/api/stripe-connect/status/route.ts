import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/stripe-connect/status
 * Returns the current Stripe Connect state for the authenticated user.
 * Used by the settings page to refresh Stripe state after OAuth redirect.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_details_submitted")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    account_id: (profile as Record<string, unknown> | null)?.stripe_connect_account_id ?? null,
    charges_enabled: !!(profile as Record<string, unknown> | null)?.stripe_connect_charges_enabled,
    details_submitted: !!(profile as Record<string, unknown> | null)?.stripe_connect_details_submitted,
  });
}
