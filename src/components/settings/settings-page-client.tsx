"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import type { Profile, QuotesPerMonth } from "@/lib/types/database";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IntegrationsSettings } from "@/components/settings/integrations-settings";
import { WhatsAppConnection } from "@/components/settings/whatsapp-connection";
import type { TaxRate } from "@/lib/types/database";

// ── Tax Rates Card ────────────────────────────────────────────────────────────

function TaxRatesCard() {
  const [taxRates, setTaxRates] = React.useState<TaxRate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newName, setNewName] = React.useState("");
  const [newRate, setNewRate] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/tax-rates")
      .then((r) => r.json())
      .then((j: { tax_rates?: TaxRate[] }) => setTaxRates(j.tax_rates ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseFloat(newRate);
    if (!newName.trim() || isNaN(rate) || rate <= 0 || rate > 100) {
      toast.error("Enter a name and a rate between 0 and 100.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tax-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), rate }),
      });
      const j = (await res.json()) as { tax_rate?: TaxRate; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save");
      setTaxRates((prev) => [...prev, j.tax_rate!]);
      setNewName("");
      setNewRate("");
      toast.success("Tax rate saved" + (j.tax_rate?.stripe_tax_rate_id ? " and synced to Stripe." : "."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tax rate");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tax-rates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setTaxRates((prev) => prev.filter((r) => r.id !== id));
      toast.success("Tax rate deleted.");
    } catch {
      toast.error("Failed to delete tax rate");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax Rates</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Save your commonly used tax rates. They&apos;ll appear in the tax dropdown on each invoice line item and sync to Stripe when connected.
        </p>

        {/* Existing rates */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : taxRates.length > 0 ? (
          <div className="flex flex-col gap-2">
            {taxRates.map((tr) => (
              <div
                key={tr.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
              >
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{tr.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{parseFloat(tr.rate).toFixed(2)}%</span>
                  {tr.stripe_tax_rate_id && (
                    <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">Stripe ✓</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(tr.id)}
                  disabled={deletingId === tr.id}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {deletingId === tr.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No tax rates saved yet.</p>
        )}

        {/* Add new */}
        <form onSubmit={(e) => void handleAdd(e)} className="flex items-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-col gap-1.5 flex-1">
            <Label htmlFor="tax-name" className="text-xs text-slate-500">Name</Label>
            <Input
              id="tax-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Texas Tax"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 w-28">
            <Label htmlFor="tax-rate" className="text-xs text-slate-500">Rate (%)</Label>
            <Input
              id="tax-rate"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder="8.75"
              required
            />
          </div>
          <Button type="submit" disabled={saving} className="shrink-0">
            {saving ? "Saving…" : "Add Rate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const quotesOptions: QuotesPerMonth[] = ["1-5", "6-15", "16-30", "30+"];

const passwordSchema = z
  .object({
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function NotificationsToggleCard({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [saving, setSaving] = React.useState(false);

  async function handleToggle() {
    const next = !enabled;
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEnabled(next);
      toast.success(next ? "Notifications enabled" : "Notifications disabled");
    } catch {
      toast.error("Failed to update notification setting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Upcoming job reminders
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Receive a WhatsApp message (or email fallback) the day before any recurring scheduled job.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={saving}
            aria-pressed={enabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              enabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
            } disabled:opacity-50`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform duration-200 ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPageClient({ userId, profile }: { userId: string; profile: Profile }) {
  const router = useRouter();
  const { t } = useLanguage();
  const ts = t.settings;

  // Build translated option lists inside the component so they re-render on lang change
  const businessAreaOptions = [
    { value: "residential", label: ts.residential },
    { value: "commercial", label: ts.commercial },
    { value: "industrial", label: ts.industrial },
    { value: "government", label: ts.government },
    { value: "other", label: ts.other },
  ];

  const serviceOptions = [
    { value: "concrete", label: ts.concrete },
    { value: "framing", label: ts.framing },
    { value: "remodeling", label: ts.remodeling },
    { value: "roofing", label: ts.roofing },
    { value: "electrical", label: ts.electrical },
    { value: "plumbing", label: ts.plumbing },
    { value: "drywall", label: ts.drywall },
    { value: "excavation", label: ts.excavation },
    { value: "landscaping", label: ts.landscaping },
  ];

  const [fullName, setFullName] = React.useState(profile.full_name);
  const [companyName, setCompanyName] = React.useState(profile.company_name);
  const [email, setEmail] = React.useState(profile.email);
  const [phone, setPhone] = React.useState(profile.phone);
  const [zip, setZip] = React.useState(((profile as unknown) as Record<string, unknown>).zip as string ?? "");
  const [quotesPerMonth, setQuotesPerMonth] = React.useState<QuotesPerMonth>(
    (profile.quotes_per_month ?? "1-5") as QuotesPerMonth,
  );
  const [businessAreas, setBusinessAreas] = React.useState<string[]>(profile.business_areas ?? []);
  const [services, setServices] = React.useState<string[]>(profile.services ?? []);

  const [defaultAlternatePayment, setDefaultAlternatePayment] = React.useState(
    profile.default_alternate_payment_instructions ?? "",
  );
  const [defaultZelle, setDefaultZelle] = React.useState(profile.default_zelle_info ?? "");
  const [defaultVenmo, setDefaultVenmo] = React.useState(profile.default_venmo_handle ?? "");

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [resetSent, setResetSent] = React.useState(false);
  const [resetSending, setResetSending] = React.useState(false);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function onSaveProfile() {
    try {
      if (email.trim().length > 0 && email.trim() !== profile.email) {
        const { error: authError } = await supabase.auth.updateUser({ email: email.trim() });
        if (authError) throw authError;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          company_name: companyName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          zip: zip.trim() || null,
          quotes_per_month: quotesPerMonth,
          business_areas: businessAreas.length ? businessAreas : [],
          services: services.length ? services : [],
          default_alternate_payment_instructions: defaultAlternatePayment.trim() || null,
          default_zelle_info: defaultZelle.trim() || null,
          default_venmo_handle: defaultVenmo.trim() || null,
        })
        .eq("id", userId);

      if (error) throw error;
      toast.success("Profile updated");
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save profile";
      toast.error(message);
    }
  }

  async function onSendResetEmail() {
    setResetSending(true);
    try {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${appUrl}/auth/callback?redirect=/auth/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("Reset email sent");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send reset email");
    } finally {
      setResetSending(false);
    }
  }

  async function onChangePassword() {
    try {
      const parsed = passwordSchema.safeParse({ newPassword, confirmPassword });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid password");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update password";
      toast.error(message);
    }
  }

  async function onDeleteAccount() {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to delete account");
      }
      toast.success("Account deleted");
      await supabase.auth.signOut();
      router.push("/auth/login");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete account";
      toast.error(message);
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">{ts.title}</div>
        <div className="text-sm text-slate-500">{ts.subtitle}</div>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>{ts.profile}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="full_name">{ts.fullName}</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company_name">{ts.companyName}</Label>
              <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{ts.email}</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{ts.phone}</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="zip">Business ZIP Code</Label>
              <Input
                id="zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="e.g. 78640"
                maxLength={10}
              />
              <p className="text-xs text-slate-400">Used by the AI assistant to find local store prices near you.</p>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <Label>{ts.quotesPerMonth}</Label>
            <Select
              value={quotesPerMonth}
              onValueChange={(v) => setQuotesPerMonth(v as QuotesPerMonth)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quotesOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium">{ts.businessAreas}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {businessAreaOptions.map((opt) => {
                const checked = businessAreas.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const next = c
                          ? Array.from(new Set([...businessAreas, opt.value]))
                          : businessAreas.filter((v) => v !== opt.value);
                        setBusinessAreas(next);
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium">{ts.servicesProvided}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {serviceOptions.map((opt) => {
                const checked = services.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const next = c
                          ? Array.from(new Set([...services, opt.value]))
                          : services.filter((v) => v !== opt.value);
                        setServices(next);
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 pt-6">
            <div className="text-sm font-medium">Default lower-fee payment text (invoices)</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Shown on PDFs when you add these to an invoice — e.g. Zelle, Venmo, or bank transfer instructions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="def-zelle">Default Zelle (phone or email)</Label>
                <Input
                  id="def-zelle"
                  value={defaultZelle}
                  onChange={(e) => setDefaultZelle(e.target.value)}
                  placeholder="+1… or name@email.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="def-venmo">Default Venmo handle</Label>
                <Input
                  id="def-venmo"
                  value={defaultVenmo}
                  onChange={(e) => setDefaultVenmo(e.target.value)}
                  placeholder="@handle"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="def-alt">Other instructions (ACH, wire, etc.)</Label>
              <Input
                id="def-alt"
                value={defaultAlternatePayment}
                onChange={(e) => setDefaultAlternatePayment(e.target.value)}
                placeholder="Optional default block for every new invoice"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button onClick={() => void onSaveProfile()}>{ts.save}</Button>
          </div>
        </CardContent>
      </Card>

      <IntegrationsSettings profile={profile} />

      {/* Tax Rates */}
      <TaxRatesCard />

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle>{ts.whatsapp}</CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsAppConnection
            userId={userId}
            primaryInitiallyConnected={!!profile.whatsapp_connected}
            secondaryInitiallyConnected={!!profile.whatsapp_secondary_connected}
          />
        </CardContent>
      </Card>

      {/* Notifications */}
      <NotificationsToggleCard initialEnabled={!!((profile as unknown as { notifications_enabled?: boolean | null }).notifications_enabled)} />

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>{ts.account}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="text-sm font-medium">{ts.changePassword}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="newPassword">{ts.newPassword}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">{ts.confirmPassword}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <Button variant="secondary" onClick={() => void onChangePassword()}>
              {ts.updatePassword}
            </Button>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={resetSending || resetSent}
                onClick={() => void onSendResetEmail()}
              >
                {resetSending ? "Sending…" : resetSent ? "Reset email sent ✓" : "Send password reset email"}
              </Button>
              {resetSent && (
                <span className="text-xs text-slate-500">Check {profile.email}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {ts.deleteAccount}
            </div>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="danger" type="button">{ts.deleteAccountBtn}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{ts.deleteConfirmTitle}</DialogTitle>
                  <DialogDescription>{ts.deleteConfirmDesc}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    disabled={isDeleting}
                  >
                    {ts.cancel}
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => void onDeleteAccount()}
                    disabled={isDeleting}
                  >
                    {isDeleting ? ts.deleting : ts.delete}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
