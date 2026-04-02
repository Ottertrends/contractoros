import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signGoogleOAuthState } from "@/lib/integrations/oauth-state";
import { buildGoogleAuthorizeUrl } from "@/lib/integrations/google-oauth";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const state = signGoogleOAuthState(user.id);
    const url = buildGoogleAuthorizeUrl(state);
    return NextResponse.redirect(url);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OAuth setup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
