"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

interface BotEvent {
  id: string;
  created_at: string;
  event_type: string;
  result: string | null;
  jid: string | null;
  summary: string | null;
}

const EVENT_COLORS: Record<string, string> = {
  received:  "bg-blue-100 text-blue-800",
  bootstrap: "bg-purple-100 text-purple-800",
  agent:     "bg-yellow-100 text-yellow-800",
  replied:   "bg-green-100 text-green-800",
  skipped:   "bg-slate-100 text-slate-600",
  error:     "bg-red-100 text-red-700",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckResult {
  ok: boolean;
  message: string;
  detail?: string;
}

interface DiagnosticResult {
  ok: boolean;
  whatsapp_connected: boolean;
  instance_name: string;
  checks: {
    anthropic: CheckResult;
    evolution: CheckResult;
    db: CheckResult;
    webhook: CheckResult;
  };
  /** Tips when Claude works but WhatsApp bot does not */
  whatsapp_hints?: string[];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusRow({ label, result }: { label: string; result: CheckResult }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">
        {result.ok ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className={`text-xs mt-0.5 ${result.ok ? "text-slate-500" : "text-red-600"}`}>
          {result.message}
        </div>
        {result.detail && (
          <div className="mt-1 text-xs text-slate-400 font-mono break-all">{result.detail}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BotDiagnostics() {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<DiagnosticResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [testMessage, setTestMessage] = React.useState("");
  const [testLoading, setTestLoading] = React.useState(false);
  const [testReply, setTestReply] = React.useState<string | null>(null);
  const [testAgentError, setTestAgentError] = React.useState<string | null>(null);

  const [resyncLoading, setResyncLoading] = React.useState(false);

  const [events, setEvents] = React.useState<BotEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = React.useState(false);

  async function loadBotEvents() {
    setEventsLoading(true);
    try {
      const res = await fetch("/api/debug/bot-events");
      const data = (await res.json()) as { events?: BotEvent[]; error?: string };
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }

  async function runDiagnostics() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/test/connection");
      const data = (await res.json()) as DiagnosticResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Diagnostic failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run diagnostics");
    } finally {
      setLoading(false);
    }
  }

  async function sendTestMessage() {
    if (!testMessage.trim()) return;
    setTestLoading(true);
    setTestReply(null);
    setTestAgentError(null);
    try {
      const res = await fetch("/api/test/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reply?: string;
        error?: string;
        agentError?: string | null;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Bot test failed");
      setTestReply(data.reply ?? "(no reply)");
      if (data.agentError) setTestAgentError(data.agentError);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bot test failed");
    } finally {
      setTestLoading(false);
    }
  }

  async function resyncWebhook() {
    setResyncLoading(true);
    try {
      const res = await fetch("/api/whatsapp/resync-webhook", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        webhookUrl?: string;
        syncedInstances?: string[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Resync failed");
      const list =
        data.syncedInstances?.length ?
          data.syncedInstances.join(", ")
          : (data.webhookUrl ?? "");
      toast.success(`Webhook synced (${list})`);
      if (data.warnings?.length) {
        toast.message("Some instances had warnings — check logs", {
          description: data.warnings.join("\n"),
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resync failed");
    } finally {
      setResyncLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Run diagnostics */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void runDiagnostics()}
          disabled={loading}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
          ) : (
            <><RefreshCw className="w-4 h-4" /> Run Diagnostics</>
          )}
        </Button>
        {result && (
          <span className={`text-sm font-medium ${result.ok ? "text-green-600" : "text-red-600"}`}>
            {result.ok ? "✅ All systems go" : "⚠️ Issues detected"}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          <StatusRow label="Anthropic API (Claude)" result={result.checks.anthropic} />
          <StatusRow label="Evolution API (WhatsApp)" result={result.checks.evolution} />
          <StatusRow label="Supabase Database" result={result.checks.db} />
          <StatusRow label="Webhook URL" result={result.checks.webhook} />
        </div>
      )}

      {result?.whatsapp_hints && result.whatsapp_hints.length > 0 ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <div className="font-semibold mb-2">WhatsApp bot troubleshooting</div>
          <ul className="list-disc pl-5 space-y-1.5 text-sky-900/90">
            {result.whatsapp_hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-sky-800/80">
            If <strong>Test Claude Agent</strong> below returns a reply but WhatsApp stays silent,
            the problem is webhook routing or self-chat rules — not the Claude API.
          </p>
        </div>
      ) : null}

      {/* Resync webhook */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Webhook Registration</div>
        <div className="text-xs text-slate-500">
          Re-registers your webhook URL with the Evolution API. Run this if the bot isn&apos;t
          responding to WhatsApp messages.
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void resyncWebhook()}
            disabled={resyncLoading}
          >
            {resyncLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
            ) : (
              "Resync Webhook"
            )}
          </Button>
        </div>
      </div>

      {/* Test bot (chat without WhatsApp) */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">Test Claude Agent</div>
        <div className="text-xs text-slate-500">
          Send a message directly to the AI agent to verify Claude is working, without needing a
          WhatsApp message.
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !testLoading) void sendTestMessage();
            }}
            placeholder="e.g. Create a project for John Smith in Austin TX"
            className="flex-1 h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button
            type="button"
            onClick={() => void sendTestMessage()}
            disabled={testLoading || !testMessage.trim()}
          >
            {testLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        {testReply && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase text-slate-400 mb-1 font-medium">Agent reply</div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">{testReply}</div>
            {testAgentError ? (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 break-words">
                <span className="font-semibold">Agent warning / error:</span> {testAgentError}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Bot event log */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">WhatsApp Bot Event Log</div>
            <div className="text-xs text-slate-500">Last 50 bot events — what happened to each message</div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadBotEvents()}
            disabled={eventsLoading}
          >
            {eventsLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Load Events</>
            )}
          </Button>
        </div>

        {events !== null && (
          events.length === 0 ? (
            <div className="text-sm text-slate-500 py-2">No bot events yet. Send yourself a WhatsApp message to see what happens.</div>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Time</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Result</th>
                    <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_COLORS[ev.event_type] ?? "bg-slate-100 text-slate-600"}`}>
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 font-mono">{ev.result ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-400 truncate max-w-xs hidden sm:table-cell">{ev.summary ?? "—"}</td>
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
