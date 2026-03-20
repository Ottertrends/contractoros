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
import { WhatsAppConnection } from "@/components/settings/whatsapp-connection";
import { BotDiagnostics } from "@/components/settings/bot-diagnostics";

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
  ];

  const [fullName, setFullName] = React.useState(profile.full_name);
  const [companyName, setCompanyName] = React.useState(profile.company_name);
  const [email, setEmail] = React.useState(profile.email);
  const [phone, setPhone] = React.useState(profile.phone);
  const [quotesPerMonth, setQuotesPerMonth] = React.useState<QuotesPerMonth>(
    (profile.quotes_per_month ?? "1-5") as QuotesPerMonth,
  );
  const [businessAreas, setBusinessAreas] = React.useState<string[]>(profile.business_areas ?? []);
  const [services, setServices] = React.useState<string[]>(profile.services ?? []);

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

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
          quotes_per_month: quotesPerMonth,
          business_areas: businessAreas.length ? businessAreas : [],
          services: services.length ? services : [],
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

          <div className="flex items-center justify-end">
            <Button onClick={() => void onSaveProfile()}>{ts.save}</Button>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle>{ts.whatsapp}</CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsAppConnection
            userId={userId}
            initiallyConnected={!!profile.whatsapp_connected}
            initialPhone={null}
          />
        </CardContent>
      </Card>

      {/* Bot diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle>{ts.diagnostics}</CardTitle>
        </CardHeader>
        <CardContent>
          <BotDiagnostics />
        </CardContent>
      </Card>

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
