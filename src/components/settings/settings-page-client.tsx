"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { supabase } from "@/lib/supabase/client";
import type { Profile, QuotesPerMonth } from "@/lib/types/database";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppConnection } from "@/components/settings/whatsapp-connection";

const businessAreaOptions = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
];

const serviceOptions = [
  { value: "concrete", label: "Concrete" },
  { value: "framing", label: "Framing" },
  { value: "remodeling", label: "Remodeling" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "drywall", label: "Drywall" },
  { value: "excavation", label: "Excavation" },
];

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
      // Update auth email first if needed (can affect sign-in/session).
      if (email.trim().length > 0 && email.trim() !== profile.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: email.trim(),
        });
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

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
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
        <div className="text-lg font-semibold text-slate-900">Settings</div>
        <div className="text-sm text-slate-500">
          Update your profile and account details.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="company_name">Company name</Label>
              <Input id="company_name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="w-full max-w-sm">
            <Label>Quotes per month</Label>
            <Select
              value={quotesPerMonth}
              onValueChange={(v) => setQuotesPerMonth(v as QuotesPerMonth)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quotesOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium">Business areas</div>
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
            <div className="text-sm font-medium">Services provided</div>
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
            <Button onClick={() => void onSaveProfile()}>Save</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <WhatsAppConnection
            userId={userId}
            initiallyConnected={!!profile.whatsapp_connected}
            initialPhone={null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="text-sm font-medium">Change password</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <Button variant="secondary" onClick={() => void onChangePassword()}>
              Update Password
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-600">
              Delete your account permanently. This cannot be undone.
            </div>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="danger" type="button">Delete account</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete account?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete your ContractorOS account and all associated data.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => void onDeleteAccount()}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
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

