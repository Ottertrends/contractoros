import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all profiles
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, company_name, email, subscription_status, subscription_plan, subscription_started_at, subscription_ended_at, stripe_customer_id, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get project counts per user
  const { data: projectCounts } = await admin
    .from("projects")
    .select("user_id")
    .in("user_id", (profiles ?? []).map((p) => p.id));

  // Get 30-day usage totals
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: usageData } = await admin
    .from("api_usage")
    .select("user_id, claude_input_tokens, claude_output_tokens, tavily_searches")
    .gte("date", thirtyDaysAgo.toISOString().slice(0, 10));

  const projectCountMap: Record<string, number> = {};
  for (const p of projectCounts ?? []) {
    projectCountMap[p.user_id] = (projectCountMap[p.user_id] ?? 0) + 1;
  }

  const usageMap: Record<string, { input: number; output: number; tavily: number }> = {};
  for (const u of usageData ?? []) {
    if (!usageMap[u.user_id]) usageMap[u.user_id] = { input: 0, output: 0, tavily: 0 };
    usageMap[u.user_id].input += u.claude_input_tokens;
    usageMap[u.user_id].output += u.claude_output_tokens;
    usageMap[u.user_id].tavily += u.tavily_searches;
  }

  const result = (profiles ?? []).map((p) => ({
    ...p,
    project_count: projectCountMap[p.id] ?? 0,
    usage_30d: usageMap[p.id] ?? { input: 0, output: 0, tavily: 0 },
  }));

  return NextResponse.json(result);
}
