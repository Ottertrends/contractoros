import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncRecurringRuleToGoogle } from "@/lib/integrations/google-calendar-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: integrations } = await admin
    .from("user_google_integrations")
    .select("user_id")
    .eq("calendar_sync_enabled", true);

  const userIds = [...new Set((integrations ?? []).map((r) => r.user_id as string))];
  let synced = 0;
  for (const uid of userIds) {
    const { data: rules } = await admin
      .from("recurring_projects")
      .select("id")
      .eq("user_id", uid)
      .eq("active", true);
    for (const r of rules ?? []) {
      const res = await syncRecurringRuleToGoogle(r.id as string);
      if (res.ok) synced++;
    }
  }

  return NextResponse.json({ users: userIds.length, rulesSynced: synced });
}
