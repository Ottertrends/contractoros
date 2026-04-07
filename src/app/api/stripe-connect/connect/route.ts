import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * GET /api/stripe-connect/connect
 * Generates a Stripe Standard OAuth URL and redirects the user to it.
 */
export async function GET(_req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_APP_URL!));
  }

  const clientId = process.env.STRIPE_LIVE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Stripe Connect not configured" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/stripe-connect/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    redirect_uri: redirectUri,
    state: user.id,
  });

  const oauthUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(oauthUrl);
}
