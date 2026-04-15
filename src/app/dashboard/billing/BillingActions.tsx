"use client";

import { useState, useEffect } from "react";
import { isPremiumTeam } from "@/lib/billing/access";

interface BillingInvoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  pdf: string | null;
  url: string | null;
}

interface Props {
  paid: boolean;
  hasStripeCustomer: boolean;
  plan: string;
  normalizedPlan: string;
}

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic (Free)",
  premium: "Premium — $29/mo",
  premium_team: "Premium Team — $49/mo",
  free_premium: "Premium (Complimentary)",
  free_premium_team: "Premium Team (Complimentary)",
  discounted_premium: "Premium — 50% off",
  discounted_premium_team: "Premium Team — 50% off",
  // legacy
  standard: "Premium — $29/mo",
  paid: "Premium — $29/mo",
  free: "Premium (Complimentary)",
  discounted: "Premium — 50% off",
};

export function BillingActions({ paid, hasStripeCustomer, plan, normalizedPlan }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"premium" | "premium_team">("premium");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [extraSeats, setExtraSeats] = useState(0);

  async function handleCheckout() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, interval, extra_seats: extraSeats }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to create checkout session");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePortal() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to open billing portal");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const premiumMonthlyPrice = interval === "annual" ? "$24.16/mo" : "$29/mo";
  const teamMonthlyPrice = interval === "annual" ? "$40.83/mo" : "$49/mo";
  const seatPrice = interval === "annual" ? "$8.33/mo" : "$10/mo";

  const isDiscounted = normalizedPlan === "discounted_premium" || normalizedPlan === "discounted_premium_team";

  // Billing history (only loaded for paid users with Stripe)
  const [history, setHistory] = useState<BillingInvoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (paid && hasStripeCustomer) {
      setHistoryLoading(true);
      fetch("/api/billing/history")
        .then((r) => r.json())
        .then((d: { invoices?: BillingInvoice[] }) => setHistory(d.invoices ?? []))
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    }
  }, [paid, hasStripeCustomer]);

  const isTeamPlan = isPremiumTeam({ subscription_plan: normalizedPlan });

  if (paid && hasStripeCustomer) {
    return (
      <div className="flex flex-col gap-6">
        {/* Section A — Current Plan + Manage */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {PLAN_LABELS[normalizedPlan] ?? plan}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePortal}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Manage Subscription"}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            To change plans, update payment method, or cancel, use the customer portal.
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Section B — Add Seats (team only) */}
        {isTeamPlan && (
          <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Team Seats</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Need more team members? Each additional seat is $10/mo or $100/yr.
            </p>
            <button
              onClick={handlePortal}
              disabled={loading}
              className="mt-1 px-4 py-2 w-fit rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Add or Remove Seats"}
            </button>
          </div>
        )}

        {/* Section C — Billing History */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Billing History</p>
          {historyLoading ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400">No billing history yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Amount</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {new Date(inv.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td className="px-3 py-2 text-slate-900 dark:text-white font-medium">
                        ${inv.amount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          inv.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : inv.status === "open" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 flex items-center gap-2">
                        {inv.pdf && (
                          <a href={inv.pdf} target="_blank" rel="noreferrer" className="text-primary text-xs underline hover:no-underline">
                            PDF
                          </a>
                        )}
                        {inv.url && (
                          <a href={inv.url} target="_blank" rel="noreferrer" className="text-primary text-xs underline hover:no-underline">
                            View
                          </a>
                        )}
                        {!inv.pdf && !inv.url && <span className="text-xs text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Choose a plan to upgrade:</p>
      {/* Interval toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setInterval("monthly")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${interval === "monthly" ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval("annual")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${interval === "annual" ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}
        >
          Annual <span className="text-xs ml-1 opacity-75">Save 17%</span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Premium */}
        <button
          type="button"
          onClick={() => { setSelectedPlan("premium"); setExtraSeats(0); }}
          className={`text-left p-4 rounded-xl border-2 transition-colors ${selectedPlan === "premium" ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}
        >
          <div className="font-semibold text-slate-900 dark:text-white mb-1">Premium</div>
          <div className="text-2xl font-bold text-primary mb-2">
            {isDiscounted ? (
              <><span className="line-through text-slate-400 text-lg mr-1">{premiumMonthlyPrice}</span> 50% off</>
            ) : premiumMonthlyPrice}
          </div>
          <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <li>✓ Unlimited projects & clients</li>
            <li>✓ Unlimited AI messages</li>
            <li>✓ Unlimited web searches</li>
            <li>✓ Proposals & Stripe payments</li>
            <li>✓ 1 WhatsApp instance</li>
          </ul>
        </button>

        {/* Premium Team */}
        <button
          type="button"
          onClick={() => setSelectedPlan("premium_team")}
          className={`text-left p-4 rounded-xl border-2 transition-colors ${selectedPlan === "premium_team" ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}
        >
          <div className="font-semibold text-slate-900 dark:text-white mb-1">Premium Team</div>
          <div className="text-2xl font-bold text-primary mb-2">
            {isDiscounted ? (
              <><span className="line-through text-slate-400 text-lg mr-1">{teamMonthlyPrice}</span> 50% off</>
            ) : teamMonthlyPrice}
          </div>
          <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <li>✓ Everything in Premium</li>
            <li>✓ 2 seats (owner + 1 member)</li>
            <li>✓ Shared workspace & WhatsApp</li>
            <li>✓ Extra seats: {seatPrice}/seat</li>
          </ul>
        </button>
      </div>

      {/* Extra seats (only for team) */}
      {selectedPlan === "premium_team" && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-400">Extra seats (+{seatPrice} each):</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExtraSeats(Math.max(0, extraSeats - 1))}
              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold hover:bg-slate-200"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-medium text-slate-900 dark:text-white">{extraSeats}</span>
            <button
              type="button"
              onClick={() => setExtraSeats(extraSeats + 1)}
              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold hover:bg-slate-200"
            >
              +
            </button>
          </div>
          {extraSeats > 0 && (
            <span className="text-xs text-slate-400">{2 + extraSeats} total seats</span>
          )}
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="px-5 py-2.5 w-fit rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
      >
        {loading
          ? "Loading..."
          : isDiscounted
          ? `Subscribe (50% off)`
          : `Subscribe to ${selectedPlan === "premium" ? "Premium" : "Premium Team"}`}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
