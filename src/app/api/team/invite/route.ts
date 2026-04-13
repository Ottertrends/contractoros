import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTeam, maxTeamSeats } from "@/lib/billing/access";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email: string = (body.email ?? "").trim().toLowerCase();
  const phone: string = (body.phone ?? "").trim() || "";

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = createSupabaseAdminClient();

  // Fetch profile to check plan + seat limit
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, subscription_status, subscription_seats")
    .eq("id", user.id)
    .single();

  if (!isPremiumTeam(profile ?? {})) {
    return NextResponse.json(
      { error: "Premium Team plan required to invite team members." },
      { status: 403 }
    );
  }

  const maxSeats = maxTeamSeats(profile ?? {});

  // Count active/pending members (owner doesn't count as a member row)
  const { count: memberCount } = await admin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .in("status", ["pending", "active"]);

  // maxSeats = total seats (owner + members). Members = maxSeats - 1
  if (isFinite(maxSeats) && (memberCount ?? 0) >= maxSeats - 1) {
    return NextResponse.json(
      { error: `You've reached your seat limit (${maxSeats} total). Add more seats in billing.` },
      { status: 402 }
    );
  }

  // Check if already invited
  const { data: existing } = await admin
    .from("team_members")
    .select("id, status")
    .eq("owner_user_id", user.id)
    .eq("invited_email", email)
    .maybeSingle();

  if (existing && existing.status !== "removed") {
    return NextResponse.json({ error: "This email has already been invited." }, { status: 409 });
  }

  // Insert or re-activate the member row
  const { data: member, error: insertError } = await admin
    .from("team_members")
    .upsert(
      {
        owner_user_id: user.id,
        invited_email: email,
        invited_phone: phone || null,
        status: "pending",
        member_user_id: null,
        accepted_at: null,
        invited_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id,invited_email" }
    )
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Send Supabase invite email
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { owner_user_id: user.id, role: "team_member" },
  });

  if (inviteError && !inviteError.message.includes("already been registered")) {
    // Non-fatal: member may already have an account — they'll still see the workspace
    console.warn("[team/invite] invite email error:", inviteError.message);
  }

  return NextResponse.json({ ok: true, member });
}
