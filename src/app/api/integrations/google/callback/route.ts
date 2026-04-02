import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyGoogleOAuthState } from "@/lib/integrations/oauth-state";
import { exchangeGoogleCode, getGoogleUserEmail } from "@/lib/integrations/google-oauth";
import { encryptGoogleRefreshToken } from "@/lib/crypto/token-encrypt";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || url.origin;

  if (err) {
    return NextResponse.redirect(new URL(`/dashboard/settings?google_error=${encodeURIComponent(err)}`, appUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/settings?google_error=missing_code", appUrl));
  }

  try {
    const userId = verifyGoogleOAuthState(state);
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?google_error=no_refresh_token", appUrl),
      );
    }

    const email = tokens.access_token
      ? await getGoogleUserEmail(tokens.access_token)
      : null;

    const enc = encryptGoogleRefreshToken(tokens.refresh_token);
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("user_google_integrations").upsert(
      {
        user_id: userId,
        google_email: email,
        refresh_token_ciphertext: enc.ciphertext,
        refresh_token_iv: enc.iv,
        refresh_token_tag: enc.tag,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      console.error("[google/callback]", error);
      return NextResponse.redirect(new URL("/dashboard/settings?google_error=save_failed", appUrl));
    }

    return NextResponse.redirect(new URL("/dashboard/settings?google_connected=1", appUrl));
  } catch (e: unknown) {
    console.error("[google/callback]", e);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?google_error=${encodeURIComponent("invalid_state")}`, appUrl),
    );
  }
}
