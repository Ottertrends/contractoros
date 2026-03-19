import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Even on error, redirect so user can try again.
    if (error) {
      console.error("Supabase callback exchange error:", error);
    }
  }

  const redirectTo = url.searchParams.get("redirect") ?? "/dashboard";
  return NextResponse.redirect(new URL(redirectTo, url.origin));
}

