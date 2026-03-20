"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

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

  const [resyncLoading, setResyncLoading] = React.useState(false);

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
    try {
      const res = await fetch("/api/test/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = (await res.json()) as { ok: boolean; reply?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Bot test failed");
      setTestReply(data.reply ?? "(no reply)");
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
      const data = (await res.json()) as { ok: boolean; webhookUrl?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Resync failed");
      toast.success(`Webhook synced → ${data.webhookUrl}`);
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

      {/* Resync webhook */}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-slate-700">Webhook Registration</div>
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
        <div className="text-sm font-medium text-slate-700">Test Claude Agent</div>
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
          </div>
        )}
      </div>
    </div>
  );
}
