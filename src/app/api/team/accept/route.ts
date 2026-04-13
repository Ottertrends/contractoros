import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Called on first dashboard load by a member whose raw_user_meta_data.owner_user_id is set.
 * Links their user_id to the team_members row and sets status = 'active'.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerUserId = user.user_metadata?.owner_user_id as string | undefined;
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, reason: "not_a_team_invite" });
  }

  const admin = createSupabaseAdminClient();
  const email = user.email ?? "";

  // Find the pending row for this email under the owner
  const { data: row } = await admin
    .from("team_members")
    .select("id, status")
    .eq("owner_user_id", ownerUserId)
    .eq("invited_email", email)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ ok: false, reason: "no_pending_invite" });
  }

  if (row.status === "active") {
    return NextResponse.json({ ok: true, reason: "already_active" });
  }

  const { error } = await admin
    .from("team_members")
    .update({
      member_user_id: user.id,
      status: "active",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
