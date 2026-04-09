"use client";

import * as React from "react";
import { toast } from "sonner";
import { X, Copy, ExternalLink, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TAX_CATEGORY_LABELS } from "@/lib/subscriptions/tax-codes";
import type { Project, TaxCategory } from "@/lib/types/database";

interface Props {
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}

export function SubscriptionBuilder({ projects, onClose, onCreated }: Props) {
  const [saving, setSaving] = React.useState(false);
  const [checkoutUrl, setCheckoutUrl] = React.useState<string | null>(null);

  // Form fields
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [interval, setInterval] = React.useState<"week" | "month">("month");
  const [setupFee, setSetupFee] = React.useState("");
  const [trialDays, setTrialDays] = React.useState("0");
  const [taxCategory, setTaxCategory] = React.useState<TaxCategory | "">("");

  const selectedProject = projects.find((p) => p.id === projectId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !name.trim() || !amount) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0.5) {
      toast.error("Amount must be at least $0.50.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          name: name.trim(),
          description: description.trim() || undefined,
          amount: amountNum,
          interval,
          setup_fee: parseFloat(setupFee) || 0,
          trial_period_days: parseInt(trialDays) || 0,
          tax_category: taxCategory || undefined,
        }),
      });

      const j = (await res.json()) as { success?: boolean; checkout_url?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to create subscription plan");

      setCheckoutUrl(j.checkout_url ?? null);
      toast.success("Subscription link generated!");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-50">New Subscription Plan</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Generate a Stripe Checkout link to put your client on a recurring plan.
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success state */}
        {checkoutUrl ? (
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <RefreshCcw className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Subscription link ready</div>
                <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Share this link with your client. They enter their card once — Stripe handles all future payments.
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-500 mb-1.5 block">Checkout URL</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 truncate">
                  {checkoutUrl}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(checkoutUrl);
                    toast.success("Link copied!");
                  }}
                  className="p-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4 text-slate-500" />
                </button>
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  title="Open link"
                >
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                </a>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto flex-1">

              {/* Project */}
              <div>
                <Label htmlFor="sub-project" className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Project <span className="text-red-500">*</span>
                </Label>
                <select
                  id="sub-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.client_name ? ` — ${p.client_name}` : ""}
                    </option>
                  ))}
                </select>
                {selectedProject?.client_email && (
                  <p className="text-xs text-slate-400 mt-1">
                    Client email: <span className="font-mono">{selectedProject.client_email}</span>
                  </p>
                )}
                {!selectedProject?.client_email && (
                  <p className="text-xs text-amber-500 mt-1">
                    ⚠ This project has no client email — the checkout link won&apos;t be pre-filled.
                  </p>
                )}
              </div>

              {/* Plan Name */}
              <div>
                <Label htmlFor="sub-name" className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Plan Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="sub-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Monthly Lawn Care"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="sub-desc" className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Description <span className="text-slate-400">(optional)</span>
                </Label>
                <Textarea
                  id="sub-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Weekly mowing and trimming, front and back yard."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              {/* Amount + Interval */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sub-amount" className="text-xs font-medium text-slate-500 mb-1.5 block">
                    Recurring Amount <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <Input
                      id="sub-amount"
                      type="number"
                      min="0.50"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="350.00"
                      className="pl-7"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="sub-interval" className="text-xs font-medium text-slate-500 mb-1.5 block">
                    Frequency <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="sub-interval"
                    value={interval}
                    onChange={(e) => setInterval(e.target.value as "week" | "month")}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="week">Weekly</option>
                    <option value="month">Monthly</option>
                  </select>
                </div>
              </div>

              {/* Setup Fee + Trial */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sub-setup" className="text-xs font-medium text-slate-500 mb-1.5 block">
                    Setup Fee <span className="text-slate-400">(first payment only)</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <Input
                      id="sub-setup"
                      type="number"
                      min="0"
                      step="0.01"
                      value={setupFee}
                      onChange={(e) => setSetupFee(e.target.value)}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="sub-trial" className="text-xs font-medium text-slate-500 mb-1.5 block">
                    Free Trial Days
                  </Label>
                  <Input
                    id="sub-trial"
                    type="number"
                    min="0"
                    step="1"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Tax Category */}
              <div>
                <Label htmlFor="sub-tax" className="text-xs font-medium text-slate-500 mb-1.5 block">
                  Tax Category <span className="text-slate-400">(optional)</span>
                </Label>
                <select
                  id="sub-tax"
                  value={taxCategory}
                  onChange={(e) => setTaxCategory(e.target.value as TaxCategory | "")}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">No tax</option>
                  {Object.entries(TAX_CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                {taxCategory && (
                  <p className="text-xs text-slate-400 mt-1">
                    Stripe will calculate tax automatically based on your client&apos;s billing address.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Generating…" : "Generate Link"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
