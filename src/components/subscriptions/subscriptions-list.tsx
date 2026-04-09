"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ServicePlan, ClientSubscription } from "@/lib/types/database";

type PlanWithProject = ServicePlan & {
  projects?: { name: string; client_name: string | null; client_email: string | null } | null;
};

type SubWithRelations = ClientSubscription & {
  projects?: { name: string; client_name: string | null; client_email: string | null } | null;
  service_plans?: { name: string; amount: string; interval: string } | null;
};

function statusVariant(s: string): "neutral" | "warning" | "success" | "danger" {
  switch (s) {
    case "active":    return "success";
    case "trialing":  return "warning";
    case "past_due":  return "danger";
    case "canceled":  return "neutral";
    default:          return "neutral";
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "active":     return "Active";
    case "trialing":   return "Trialing";
    case "past_due":   return "Past Due";
    case "canceled":   return "Canceled";
    case "incomplete": return "Pending";
    default:           return s;
  }
}

function fmt(n: string | number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Active Subscriptions Table ────────────────────────────────────────────────

interface SubsTableProps {
  subscriptions: SubWithRelations[];
  onRefresh: () => void;
}

export function ActiveSubscriptionsTable({ subscriptions, onRefresh }: SubsTableProps) {
  const [canceling, setCanceling] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  async function handleCancel(id: string) {
    setCanceling(id);
    try {
      const res = await fetch(`/api/subscriptions/${id}/cancel`, { method: "POST" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to cancel");
      toast.success("Subscription canceled.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCanceling(null);
      setConfirmId(null);
    }
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        No active subscriptions yet. Generate a link above to get started.
      </div>
    );
  }

  return (
    <>
      {/* Cancel confirm dialog */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-50 mb-1">Cancel subscription?</div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This will immediately cancel the client&apos;s subscription in Stripe. They will not be charged again. This cannot be undone — a new link must be sent to re-activate.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setConfirmId(null)}>Keep</Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white border-0"
                disabled={canceling === confirmId}
                onClick={() => void handleCancel(confirmId)}
              >
                {canceling === confirmId ? "Canceling…" : "Yes, cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <th className="text-left py-2 pr-4 font-medium">Client</th>
              <th className="text-left py-2 pr-4 font-medium">Project</th>
              <th className="text-left py-2 pr-4 font-medium">Plan</th>
              <th className="text-left py-2 pr-4 font-medium">Status</th>
              <th className="text-left py-2 pr-4 font-medium">Next Billing</th>
              <th className="text-right py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((sub) => (
              <tr key={sub.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {sub.projects?.client_name ?? "—"}
                  </div>
                  {sub.projects?.client_email && (
                    <div className="text-xs text-slate-400">{sub.projects.client_email}</div>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                  {sub.projects?.name ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  {sub.service_plans ? (
                    <div>
                      <div className="text-slate-700 dark:text-slate-300">{sub.service_plans.name}</div>
                      <div className="text-xs text-slate-400">
                        {fmt(sub.service_plans.amount)} / {sub.service_plans.interval}
                      </div>
                    </div>
                  ) : "—"}
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={statusVariant(sub.status)}>{statusLabel(sub.status)}</Badge>
                </td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                  {sub.status === "trialing" && sub.trial_end
                    ? `Trial ends ${fmtDate(sub.trial_end)}`
                    : fmtDate(sub.current_period_end)}
                </td>
                <td className="py-3 text-right">
                  {sub.status !== "canceled" && (
                    <button
                      type="button"
                      onClick={() => setConfirmId(sub.id)}
                      disabled={!!canceling}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                      title="Cancel subscription"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Subscription Plans Table ──────────────────────────────────────────────────

interface PlansTableProps {
  plans: PlanWithProject[];
  subscriptions: SubWithRelations[];
}

export function SubscriptionPlansTable({ plans, subscriptions }: PlansTableProps) {
  if (plans.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        No subscription plans yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            <th className="text-left py-2 pr-4 font-medium">Plan</th>
            <th className="text-left py-2 pr-4 font-medium">Project</th>
            <th className="text-left py-2 pr-4 font-medium">Amount</th>
            <th className="text-left py-2 pr-4 font-medium">Active</th>
            <th className="text-right py-2 font-medium">Checkout Link</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const activeCount = subscriptions.filter(
              (s) => s.service_plan_id === plan.id && ["active", "trialing", "past_due"].includes(s.status),
            ).length;

            return (
              <tr key={plan.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-800 dark:text-slate-200">{plan.name}</div>
                  {plan.description && (
                    <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{plan.description}</div>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                  {plan.projects?.name ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  <div className="text-slate-700 dark:text-slate-300">{fmt(plan.amount)}</div>
                  <div className="text-xs text-slate-400">/ {plan.interval}</div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-sm font-medium ${activeCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                    {activeCount} {activeCount === 1 ? "client" : "clients"}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {plan.stripe_checkout_url ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(plan.stripe_checkout_url!);
                          toast.success("Link copied!");
                        }}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Copy checkout link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={plan.stripe_checkout_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded text-slate-400 hover:text-primary transition-colors"
                        title="Open checkout link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
