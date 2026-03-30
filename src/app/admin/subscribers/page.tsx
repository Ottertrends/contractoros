import { isAdminAuthenticated } from "@/lib/admin/auth";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function SubscribersPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const admin = createSupabaseAdminClient();

  const { data: active } = await admin
    .from("profiles")
    .select("id, full_name, company_name, email, subscription_status, subscription_plan, subscription_started_at")
    .in("subscription_status", ["active", "trialing"])
    .order("subscription_started_at", { ascending: false });

  const { data: churned } = await admin
    .from("profiles")
    .select("id, full_name, company_name, email, subscription_status, subscription_started_at, subscription_ended_at")
    .eq("subscription_status", "canceled")
    .order("subscription_ended_at", { ascending: false });

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link href="/admin/users" className="text-sm text-slate-400 hover:underline">
            &larr; All Users
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscribers</h1>
        </div>

        {/* Active */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Active Subscribers ({active?.length ?? 0})
          </h2>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-700">
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Subscribed Since</th>
                </tr>
              </thead>
              <tbody>
                {(active ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${p.id}`} className="font-medium text-primary hover:underline">{p.full_name}</Link>
                      <div className="text-xs text-slate-500">{p.company_name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.email}</td>
                    <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-300">{p.subscription_plan}</td>
                    <td className="px-4 py-3 text-slate-500">{p.subscription_started_at ? new Date(p.subscription_started_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
                {!active?.length && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No active subscribers yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Churned */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Churned ({churned?.length ?? 0})
          </h2>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-700">
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Was Subscriber For</th>
                  <th className="px-4 py-3">Canceled</th>
                </tr>
              </thead>
              <tbody>
                {(churned ?? []).map((p) => {
                  const started = p.subscription_started_at ? new Date(p.subscription_started_at) : null;
                  const ended = p.subscription_ended_at ? new Date(p.subscription_ended_at) : null;
                  const days = started && ended ? Math.round((ended.getTime() - started.getTime()) / 86400000) : null;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${p.id}`} className="font-medium text-primary hover:underline">{p.full_name}</Link>
                        <div className="text-xs text-slate-500">{p.company_name}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.email}</td>
                      <td className="px-4 py-3 text-slate-500">{days != null ? `${days} days` : "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{ended ? ended.toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
                {!churned?.length && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No churned subscribers</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
