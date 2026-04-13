"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Profile {
  id: string;
  full_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  subscription_status?: string;
  subscription_plan?: string;
  subscription_seats?: number;
  subscription_billing_interval?: string;
  subscription_started_at?: string;
  subscription_ended_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

interface Invoice {
  id: string;
  invoice_number?: string;
  status?: string;
  total?: number;
}

interface Memory {
  memory_text?: string;
  updated_at?: string;
}

interface UsageRow {
  date: string;
  claude_input_tokens: number;
  claude_output_tokens: number;
  tavily_searches: number;
  web_messages: number;
  haiku_input_tokens: number;
  haiku_output_tokens: number;
}

interface CheckResult {
  ok: boolean;
  message: string;
  detail?: string;
}

interface DiagnosticsResult {
  ok: boolean;
  checks: {
    anthropic: CheckResult;
    evolution: CheckResult;
    db: CheckResult;
    webhook: CheckResult;
  };
  whatsapp_connected?: boolean;
  whatsapp_secondary_connected?: boolean;
  instance_name?: string;
}

interface BotEvent {
  id: string;
  created_at: string;
  event_type: string;
  result?: string;
  jid?: string;
  summary?: string;
}

interface Props {
  userId: string;
  profile: Profile;
  projects: Project[];
  invoices: Invoice[];
  memory: Memory | null;
  usage: UsageRow[];
}

export function AdminUserDetailClient({ userId, profile, projects, invoices, memory, usage }: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState(profile.subscription_plan ?? "basic");
  const [status, setStatus] = useState(profile.subscription_status ?? "none");
  const [seats, setSeats] = useState(profile.subscription_seats ?? 0);
  const [billingInterval, setBillingInterval] = useState(profile.subscription_billing_interval ?? "monthly");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const [resyncMsg, setResyncMsg] = useState("");
  const [resyncing, setResyncing] = useState(false);

  const [events, setEvents] = useState<BotEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  const totalSonnetIn  = usage.reduce((acc, u) => acc + u.claude_input_tokens, 0);
  const totalSonnetOut = usage.reduce((acc, u) => acc + u.claude_output_tokens, 0);
  const totalHaikuIn   = usage.reduce((acc, u) => acc + (u.haiku_input_tokens ?? 0), 0);
  const totalHaikuOut  = usage.reduce((acc, u) => acc + (u.haiku_output_tokens ?? 0), 0);
  const totalTokens    = totalSonnetIn + totalSonnetOut + totalHaikuIn + totalHaikuOut;
  const totalTavily    = usage.reduce((acc, u) => acc + u.tavily_searches, 0);

  const haikuTokens  = totalHaikuIn + totalHaikuOut;
  const sonnetTokens = totalSonnetIn + totalSonnetOut;
  const haikuPct     = totalTokens > 0 ? Math.round((haikuTokens / totalTokens) * 100) : 0;

  // Cost estimates (per-million pricing)
  const sonnetCost = (totalSonnetIn / 1_000_000) * 3 + (totalSonnetOut / 1_000_000) * 15;
  const haikuCost  = (totalHaikuIn  / 1_000_000) * 0.8 + (totalHaikuOut / 1_000_000) * 4;
  const totalCost  = sonnetCost + haikuCost;

  async function sendPasswordReset() {
    setResetSending(true);
    setResetMsg("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/send-password-reset`, { method: "POST" });
      const data = await res.json();
      setResetMsg(res.ok ? "Reset email sent ✓" : `Error: ${data.error}`);
    } finally {
      setResetSending(false);
    }
  }

  async function deleteUser() {
    setDeleting(true);
    setDeleteMsg("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        router.push("/admin/users");
      } else {
        setDeleteMsg(`Error: ${data.error}`);
        setDeleting(false);
        setDeleteOpen(false);
      }
    } catch {
      setDeleteMsg("Network error");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function savePlan() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription_plan: plan,
          subscription_status: status,
          subscription_seats: seats,
          subscription_billing_interval: billingInterval,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMsg("Saved successfully");
      } else {
        setSaveMsg(`Error: ${data.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runDiagnostics() {
    setDiagLoading(true);
    setDiagnostics(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/diagnostics`);
      const data = await res.json();
      setDiagnostics(data);
    } finally {
      setDiagLoading(false);
    }
  }

  async function resync() {
    setResyncing(true);
    setResyncMsg("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/resync`, { method: "POST" });
      const data = await res.json();
      setResyncMsg(data.ok ? `Synced: ${data.syncedInstances?.join(", ")}` : `Error: ${data.error}`);
    } finally {
      setResyncing(false);
    }
  }

  async function loadEvents() {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/events`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } finally {
      setEventsLoading(false);
    }
  }

  function CheckRow({ label, result }: { label: string; result: CheckResult }) {
    return (
      <div className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
        <span className={`mt-0.5 text-xs font-bold ${result.ok ? "text-emerald-500" : "text-red-500"}`}>
          {result.ok ? "OK" : "FAIL"}
        </span>
        <div>
          <div className="text-sm text-slate-800 dark:text-slate-200">{label}: {result.message}</div>
          {result.detail && <div className="text-xs text-slate-400 mt-0.5">{result.detail}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* User Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">User Actions</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={sendPasswordReset}
            disabled={resetSending}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {resetSending ? "Sending…" : "Send Password Reset Email"}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50"
          >
            Delete User
          </button>
        </div>
        {resetMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{resetMsg}</p>}
        {deleteMsg && <p className="mt-3 text-sm text-red-600">{deleteMsg}</p>}

        {/* Delete confirmation dialog */}
        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full mx-4 shadow-xl">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Delete user?</h3>
              <p className="text-sm text-slate-500 mb-4">
                This will permanently delete <strong>{profile.full_name ?? profile.email}</strong> and all their data (projects, invoices, memory). This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteUser}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subscription management */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Subscription Management</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 uppercase font-medium">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="basic">Basic (Free Tier)</option>
              <option value="premium">Premium</option>
              <option value="premium_team">Premium Team</option>
              <option value="free_premium">Free Premium (Complimentary)</option>
              <option value="free_premium_team">Free Premium Team (Comp. — Unlimited Seats)</option>
              <option value="discounted_premium">Discounted 50% — Premium</option>
              <option value="discounted_premium_team">Discounted 50% — Premium Team</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 uppercase font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="none">None</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 uppercase font-medium">Billing Interval</label>
            <select
              value={billingInterval}
              onChange={(e) => setBillingInterval(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          {(plan === "premium_team" || plan === "free_premium_team" || plan === "discounted_premium_team") && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase font-medium">Extra Seats (beyond base 2)</label>
              <input
                type="number"
                min={0}
                value={seats}
                onChange={(e) => setSeats(Math.max(0, parseInt(e.target.value) || 0))}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-xs text-slate-400">
                {plan === "free_premium_team" ? "Unlimited seats (admin-granted)" : `Total seats: ${2 + seats} (owner + ${1 + seats} members)`}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={savePlan}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saveMsg && <span className="text-sm text-slate-500">{saveMsg}</span>}
        </div>
        {profile.stripe_customer_id && (
          <p className="text-xs text-slate-400 mt-3">Stripe Customer: {profile.stripe_customer_id}</p>
        )}
        {profile.stripe_subscription_id && (
          <p className="text-xs text-slate-400">Stripe Subscription: {profile.stripe_subscription_id}</p>
        )}
      </div>

      {/* Usage stats */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Usage (Last 30 Days)</h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalTokens.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Total Tokens</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalTavily}</div>
            <div className="text-xs text-slate-500">Tavily Searches</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{usage.length}</div>
            <div className="text-xs text-slate-500">Active Days</div>
          </div>
        </div>

        {/* Model Split */}
        <div className="border border-slate-100 dark:border-slate-800 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Model Split</h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900 dark:text-white">{sonnetTokens.toLocaleString()}</div>
              <div className="text-xs text-slate-500">Sonnet Tokens</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${haikuPct >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white"}`}>
                {haikuTokens.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">Haiku Tokens ({haikuPct}%)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900 dark:text-white">${totalCost.toFixed(4)}</div>
              <div className="text-xs text-slate-500">Est. Cost</div>
            </div>
          </div>
          {/* Progress bar */}
          {totalTokens > 0 && (
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${haikuPct}%` }}
              />
            </div>
          )}
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>Sonnet ({100 - haikuPct}%)</span>
            <span>Haiku ({haikuPct}%)</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>Sonnet: ${sonnetCost.toFixed(4)} <span className="text-slate-400">($3/$15 per M)</span></div>
            <div>Haiku: ${haikuCost.toFixed(4)} <span className="text-slate-400">($0.80/$4 per M)</span></div>
          </div>
        </div>

        {usage.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Sonnet In</th>
                  <th className="pb-2">Sonnet Out</th>
                  <th className="pb-2">Haiku In</th>
                  <th className="pb-2">Haiku Out</th>
                  <th className="pb-2">Tavily</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.date} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.date}</td>
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.claude_input_tokens.toLocaleString()}</td>
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.claude_output_tokens.toLocaleString()}</td>
                    <td className="py-1 text-emerald-600 dark:text-emerald-400">{(u.haiku_input_tokens ?? 0).toLocaleString()}</td>
                    <td className="py-1 text-emerald-600 dark:text-emerald-400">{(u.haiku_output_tokens ?? 0).toLocaleString()}</td>
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.tavily_searches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Projects */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Projects ({projects.length})</h2>
        {projects.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {projects.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between">
                <span className="text-sm text-slate-800 dark:text-slate-200">{p.name}</span>
                <span className="text-xs text-slate-400 capitalize">{p.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No projects yet</p>
        )}
      </div>

      {/* Recent invoices */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Recent Invoices ({invoices.length})</h2>
        {invoices.length > 0 ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {invoices.map((inv) => (
              <li key={inv.id} className="py-2 flex items-center justify-between">
                <span className="text-sm text-slate-800 dark:text-slate-200">
                  {inv.invoice_number ?? inv.id.slice(0, 8)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 capitalize">{inv.status}</span>
                  {inv.total != null && (
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      ${Number(inv.total).toFixed(2)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No invoices yet</p>
        )}
      </div>

      {/* Agent Memory */}
      {memory?.memory_text && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-2">Agent Memory</h2>
          {memory.updated_at && (
            <p className="text-xs text-slate-400 mb-3">Last updated: {new Date(memory.updated_at).toLocaleString()}</p>
          )}
          <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-800 rounded-lg p-4 overflow-auto max-h-64">
            {memory.memory_text}
          </pre>
        </div>
      )}

      {/* Bot Diagnostics */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Bot Diagnostics</h2>
          <button
            onClick={runDiagnostics}
            disabled={diagLoading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {diagLoading ? "Running..." : "Run Diagnostics"}
          </button>
        </div>
        {diagnostics && (
          <div>
            <div className={`text-sm font-medium mb-3 ${diagnostics.ok ? "text-emerald-600" : "text-red-600"}`}>
              Overall: {diagnostics.ok ? "All OK" : "Issues detected"}
            </div>
            <CheckRow label="Anthropic" result={diagnostics.checks.anthropic} />
            <CheckRow label="Evolution" result={diagnostics.checks.evolution} />
            <CheckRow label="Supabase" result={diagnostics.checks.db} />
            <CheckRow label="Webhook" result={diagnostics.checks.webhook} />
          </div>
        )}
      </div>

      {/* Resync Webhook */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900 dark:text-white">Resync Webhook</h2>
          <button
            onClick={resync}
            disabled={resyncing}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {resyncing ? "Resyncing..." : "Resync"}
          </button>
        </div>
        {resyncMsg && <p className="text-sm text-slate-600 dark:text-slate-400">{resyncMsg}</p>}
      </div>

      {/* Bot Events */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white">Bot Events</h2>
          <button
            onClick={loadEvents}
            disabled={eventsLoading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {eventsLoading ? "Loading..." : "Load Events"}
          </button>
        </div>
        {events !== null && (
          events.length === 0 ? (
            <p className="text-sm text-slate-400">No events found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Result</th>
                    <th className="pb-2">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="py-1 text-slate-500">{new Date(ev.created_at).toLocaleString()}</td>
                      <td className="py-1 text-slate-600 dark:text-slate-400">{ev.event_type}</td>
                      <td className="py-1 text-slate-600 dark:text-slate-400">{ev.result ?? "—"}</td>
                      <td className="py-1 text-slate-500 max-w-xs truncate">{ev.summary ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
