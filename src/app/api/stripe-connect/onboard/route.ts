import { NextResponse } from "next/server";

/**
 * Legacy endpoint — redirects to the new Stripe Standard OAuth flow.
 * Kept for backwards compatibility with any old bookmarks or integrations.
 */
export async function POST() {
  return NextResponse.json({ url: "/api/stripe-connect/connect" });
}

export async function GET() {
  return NextResponse.redirect(new URL("/api/stripe-connect/connect", process.env.NEXT_PUBLIC_APP_URL!));
}
