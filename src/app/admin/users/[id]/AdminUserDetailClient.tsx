"use client";

import { useState } from "react";

interface Profile {
  id: string;
  full_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  subscription_status?: string;
  subscription_plan?: string;
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
  const [plan, setPlan] = useState(profile.subscription_plan ?? "standard");
  const [status, setStatus] = useState(profile.subscription_status ?? "none");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const [resyncMsg, setResyncMsg] = useState("");
  const [resyncing, setResyncing] = useState(false);

  const [events, setEvents] = useState<BotEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  const totalTokens = usage.reduce((acc, u) => acc + u.claude_input_tokens + u.claude_output_tokens, 0);
  const totalTavily = usage.reduce((acc, u) => acc + u.tavily_searches, 0);

  async function savePlan() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_plan: plan, subscription_status: status }),
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
              <option value="standard">Standard</option>
              <option value="discounted">Discounted (50%)</option>
              <option value="free">Free (Complimentary)</option>
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
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalTokens.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Claude Tokens</div>
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
        {usage.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Input Tokens</th>
                  <th className="pb-2">Output Tokens</th>
                  <th className="pb-2">Tavily</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.date} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.date}</td>
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.claude_input_tokens.toLocaleString()}</td>
                    <td className="py-1 text-slate-600 dark:text-slate-400">{u.claude_output_tokens.toLocaleString()}</td>
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
