import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/stripe-connect/callback
 * Receives the Stripe Standard OAuth redirect, exchanges the code for an account ID,
 * and saves the connected account to the user's profile.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    console.error("[stripe-connect/callback] OAuth error:", error, errorDescription);
    return NextResponse.redirect(`${appUrl}/dashboard/settings?stripe=error&reason=${encodeURIComponent(errorDescription ?? error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?stripe=error&reason=no_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${appUrl}/auth/login`);
  }

  try {
    const stripe = getStripe();
    const response = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const stripeAccountId = response.stripe_user_id;
    if (!stripeAccountId) {
      throw new Error("No stripe_user_id in OAuth response");
    }

    // Fetch the account to get charges_enabled / details_submitted
    const account = await stripe.accounts.retrieve(stripeAccountId);

    await supabase
      .from("profiles")
      .update({
        stripe_connect_account_id: stripeAccountId,
        stripe_connect_charges_enabled: account.charges_enabled,
        stripe_connect_details_submitted: account.details_submitted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    return NextResponse.redirect(`${appUrl}/dashboard/settings?stripe=connected`);
  } catch (err) {
    console.error("[stripe-connect/callback] token exchange error:", err);
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(`${appUrl}/dashboard/settings?stripe=error&reason=${encodeURIComponent(msg)}`);
  }
}
