"use client";

import * as React from "react";
import { toast } from "sonner";

import type { Profile } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IntegrationsSettings({ profile }: { profile: Profile }) {
  const [google, setGoogle] = React.useState<{ connected: boolean; googleEmail: string | null } | null>(
    null,
  );
  const [syncing, setSyncing] = React.useState(false);

  // Local Stripe state — starts from server-rendered profile props
  const [stripeAccountId, setStripeAccountId] = React.useState<string | null>(
    profile.stripe_connect_account_id ?? null,
  );
  const [stripeChargesOk, setStripeChargesOk] = React.useState<boolean>(
    !!(profile.stripe_connect_charges_enabled),
  );
  const [stripeLoading, setStripeLoading] = React.useState(false);
  const [stripeDisconnecting, setStripeDisconnecting] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/integrations/google")
      .then((r) => r.json())
      .then((j: { connected?: boolean; googleEmail?: string | null }) =>
        setGoogle({ connected: !!j.connected, googleEmail: j.googleEmail ?? null }),
      )
      .catch(() => setGoogle({ connected: false, googleEmail: null }));
  }, []);

  async function syncCalendar() {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/google/calendar-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json()) as { error?: string; synced?: number; results?: unknown[] };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Sync failed");
      const n = typeof j.synced === "number" ? j.synced : (j.results as unknown[] | undefined)?.length ?? 0;
      toast.success(`Synced ${n} recurring rule(s) to Google Calendar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Calendar sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectGoogle() {
    const res = await fetch("/api/integrations/google", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect Google");
      return;
    }
    setGoogle({ connected: false, googleEmail: null });
    toast.success("Google disconnected");
  }

  function connectStripe() {
    setStripeLoading(true);
    window.location.href = "/api/stripe-connect/connect";
  }

  async function disconnectStripe() {
    setStripeDisconnecting(true);
    try {
      const res = await fetch("/api/stripe-connect/disconnect", { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to disconnect");
      }
      setStripeAccountId(null);
      setStripeChargesOk(false);
      toast.success("Stripe disconnected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect Stripe");
    } finally {
      setStripeDisconnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* ── Google ── */}
        <div className="space-y-3">
          <div className="text-sm font-medium">Google (Calendar and Gmail)</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Connect Google for one-way calendar sync from recurring jobs and to send invoices as PDF
            attachments from your Gmail.
          </p>
          {google?.connected ? (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-slate-800 dark:text-slate-200">
                Connected{google.googleEmail ? ` as ${google.googleEmail}` : ""}.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={syncing} onClick={() => void syncCalendar()}>
                  {syncing ? "Syncing…" : "Sync calendar now"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void disconnectGoogle()}>
                  Disconnect Google
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" asChild>
              <a href="/api/integrations/google/authorize">Connect Google</a>
            </Button>
          )}
        </div>

        {/* ── Stripe ── */}
        <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          <div className="text-sm font-medium">Stripe Connect (client payments)</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Clients pay you on your own Stripe account (cards; optional ACH on invoices that enable it).
            This is separate from your ContractorOS subscription billing.
          </p>

          {stripeAccountId ? (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-slate-800 dark:text-slate-200">
                {stripeChargesOk
                  ? "✓ Connected — your Stripe account is active and ready to accept payments."
                  : "Connected, but Stripe onboarding is not complete. Finish setup to accept payments."}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={stripeLoading}
                  onClick={() => void connectStripe()}
                >
                  {stripeLoading ? "Opening Stripe…" : "Reconnect Stripe"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stripeDisconnecting}
                  onClick={() => void disconnectStripe()}
                >
                  {stripeDisconnecting ? "Disconnecting…" : "Disconnect Stripe"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-slate-500 dark:text-slate-400">Not connected.</div>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={stripeLoading}
                  onClick={() => void connectStripe()}
                >
                  {stripeLoading ? "Opening Stripe…" : "Connect Stripe"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
