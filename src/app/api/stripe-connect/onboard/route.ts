import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createAccountOnboardingLink,
  createConnectExpressAccount,
} from "@/lib/stripe-connect";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin.from("profiles").select("email, stripe_connect_account_id").eq("id", user.id).single();
    if (!profile?.email) return NextResponse.json({ error: "Profile email missing" }, { status: 400 });

    const url = new URL(request.url);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || url.origin;

    let accountId = profile.stripe_connect_account_id as string | null;
    if (!accountId) {
      accountId = await createConnectExpressAccount({
        userId: user.id,
        email: profile.email as string,
      });
      await admin
        .from("profiles")
        .update({
          stripe_connect_account_id: accountId,
          stripe_connect_charges_enabled: false,
          stripe_connect_details_submitted: false,
        })
        .eq("id", user.id);
    }

    const onboardUrl = await createAccountOnboardingLink({
      accountId,
      refreshUrl: `${appUrl}/dashboard/settings?stripe_connect=refresh`,
      returnUrl: `${appUrl}/dashboard/settings?stripe_connect=return`,
    });

    return NextResponse.json({ url: onboardUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Stripe Connect failed";
    console.error("[stripe-connect/onboard]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
