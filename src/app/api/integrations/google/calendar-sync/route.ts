import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncRecurringRuleToGoogle } from "@/lib/integrations/google-calendar-sync";

/** Sync one recurring rule or all for the user (admin-backed ownership check). */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ruleId?: string };
  const admin = createSupabaseAdminClient();

  if (body.ruleId) {
    const { data: rule } = await admin
      .from("recurring_projects")
      .select("id")
      .eq("id", body.ruleId)
      .eq("user_id", user.id)
      .single();
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await syncRecurringRuleToGoogle(body.ruleId);
    return NextResponse.json(result);
  }

  const { data: rules } = await admin
    .from("recurring_projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true);

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const r of rules ?? []) {
    const res = await syncRecurringRuleToGoogle(r.id as string);
    results.push({ id: r.id as string, ok: res.ok, error: res.error });
  }
  return NextResponse.json({ synced: results.length, results });
}
