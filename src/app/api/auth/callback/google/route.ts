import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Handles the Google OAuth redirect URI registered in Google Cloud Console.
 * Exchanges the Supabase PKCE code and redirects to the dashboard.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[google-callback] code exchange error:", error.message);
    }
  }

  const redirectTo = url.searchParams.get("redirect") ?? "/dashboard";
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
