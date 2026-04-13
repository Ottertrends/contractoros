import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { AdminLogoutButton } from "@/app/admin/AdminLogoutButton";

function planBadge(plan: string) {
  const map: Record<string, string> = {
    basic: "Basic",
    premium: "Premium",
    premium_team: "Team",
    free_premium: "Free Premium",
    free_premium_team: "Free Team",
    discounted_premium: "Discounted",
    discounted_premium_team: "Disc. Team",
    // legacy
    standard: "Premium",
    paid: "Premium",
    free: "Free Premium",
    discounted: "Discounted",
  };
  return map[plan] ?? plan;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "Active",
    trialing: "Trialing",
    past_due: "Past Due",
    canceled: "Canceled",
    none: "None",
  };
  return map[status] ?? status;
}

function statusColor(status: string) {
  if (status === "active" || status === "trialing") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (status === "past_due") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  if (status === "canceled") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
}

export default async function AdminUsersPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const admin = createSupabaseAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, company_name, email, subscription_status, subscription_plan, subscription_started_at, created_at")
    .order("created_at", { ascending: false });

  // Get project counts
  const userIds = (profiles ?? []).map((p) => p.id);
  const { data: projectRows } = userIds.length
    ? await admin.from("projects").select("user_id").in("user_id", userIds)
    : { data: [] };

  const projectMap: Record<string, number> = {};
  for (const row of projectRows ?? []) {
    projectMap[row.user_id] = (projectMap[row.user_id] ?? 0) + 1;
  }

  // Get 30-day usage
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: usageRows } = userIds.length
    ? await admin
        .from("api_usage")
        .select("user_id, claude_input_tokens, claude_output_tokens, tavily_searches, haiku_input_tokens, haiku_output_tokens")
        .gte("date", since)
    : { data: [] };

  const usageMap: Record<string, { input: number; output: number; tavily: number; haikuIn: number; haikuOut: number }> = {};
  for (const u of usageRows ?? []) {
    if (!usageMap[u.user_id]) usageMap[u.user_id] = { input: 0, output: 0, tavily: 0, haikuIn: 0, haikuOut: 0 };
    usageMap[u.user_id].input += u.claude_input_tokens;
    usageMap[u.user_id].output += u.claude_output_tokens;
    usageMap[u.user_id].tavily += u.tavily_searches;
    usageMap[u.user_id].haikuIn += (u.haiku_input_tokens ?? 0);
    usageMap[u.user_id].haikuOut += (u.haiku_output_tokens ?? 0);
  }

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin — Users</h1>
            <p className="text-sm text-slate-500">{profiles?.length ?? 0} total users</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/subscribers" className="text-sm text-primary hover:underline">
              Subscribers
            </Link>
            <AdminLogoutButton />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-700">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Name / Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Since</th>
                  <th className="px-4 py-3">Projects</th>
                  <th className="px-4 py-3">Tokens (30d)</th>
                  <th className="px-4 py-3">Haiku %</th>
                  <th className="px-4 py-3">Tavily (30d)</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(profiles ?? []).map((p) => {
                  const usage = usageMap[p.id] ?? { input: 0, output: 0, tavily: 0, haikuIn: 0, haikuOut: 0 };
                  const haikuTokens = usage.haikuIn + usage.haikuOut;
                  const totalTokens = usage.input + usage.output + haikuTokens;
                  const haikuPct = totalTokens > 0 ? Math.round((haikuTokens / totalTokens) * 100) : null;
                  const status = p.subscription_status ?? "none";
                  return (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{p.full_name}</div>
                        <div className="text-xs text-slate-500">{p.company_name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.email}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{planBadge(p.subscription_plan ?? "standard")}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(status)}`}>
                          {statusBadge(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {p.subscription_started_at
                          ? new Date(p.subscription_started_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-400">{projectMap[p.id] ?? 0}</td>
                      <td className="px-4 py-3 text-slate-500">{totalTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {haikuPct !== null ? (
                          <span className={haikuPct >= 50 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
                            {haikuPct}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{usage.tavily}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${p.id}`} className="text-primary text-xs hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {!profiles?.length && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-400">No users yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
