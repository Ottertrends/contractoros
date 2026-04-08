"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Mail } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import type {
  Invoice,
  InvoiceDesign,
  InvoiceItem,
  InvoiceStatus,
  PriceBookItem,
  Project,
} from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// jsPDF must never be SSR'd — dynamic import with ssr:false prevents the Node build from loading
const PdfExportButton = dynamic(
  () => import("./pdf-export-button").then((m) => ({ default: m.PdfExportButton })),
  { ssr: false, loading: () => <span className="text-sm text-slate-400">Loading PDF…</span> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  _id: string;
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
}

interface Props {
  mode: "create" | "edit";
  userId: string;
  projects: Project[];
  priceBook: PriceBookItem[];
  nextInvoiceNumber: string;
  invoice?: Invoice;
  existingItems?: InvoiceItem[];
  defaultProjectId?: string;
}

type ProfileRow = {
  company_name: string | null;
  phone: string | null;
  email: string | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_charges_enabled?: boolean | null;
};

type ProfileDesignRow = ProfileRow & {
  invoice_logo_url: string | null;
  invoice_primary_color: string | null;
  invoice_title_font: string | null;
  invoice_body_font: string | null;
  invoice_footer: string | null;
  default_alternate_payment_instructions?: string | null;
  default_zelle_info?: string | null;
  default_venmo_handle?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function calcLineTotal(qty: string, price: string): string {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  return String(q * p);
}

function newLineItem(): LineItem {
  return { _id: crypto.randomUUID(), description: "", quantity: "1", unit_price: "0", total: "0" };
}

function statusVariant(s: InvoiceStatus) {
  const map: Record<InvoiceStatus, "secondary" | "warning" | "success" | "danger" | "neutral"> = {
    draft: "neutral",
    open: "warning",
    sent: "warning",
    paid: "success",
    void: "danger",
    uncollectible: "danger",
    cancelled: "danger",
  };
  return map[s] ?? "secondary";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceFormClient({
  mode,
  userId,
  projects,
  priceBook,
  nextInvoiceNumber,
  invoice,
  existingItems,
  defaultProjectId,
}: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const ti = t.invoices;
  const tp = t.projects;

  const [projectId, setProjectId] = React.useState<string>(
    invoice?.project_id ?? defaultProjectId ?? projects[0]?.id ?? "",
  );
  const [invoiceNumber] = React.useState<string>(
    invoice?.invoice_number ?? nextInvoiceNumber,
  );
  const [status, setStatus] = React.useState<InvoiceStatus>(invoice?.status ?? "draft");
  const [notes, setNotes] = React.useState<string>(invoice?.notes ?? "");
  const [taxRate, setTaxRate] = React.useState<string>(
    invoice?.tax_rate ? String(parseFloat(invoice.tax_rate)) : "0",
  );
  const [lineItems, setLineItems] = React.useState<LineItem[]>(
    existingItems && existingItems.length > 0
      ? existingItems.map((it) => ({
          _id: it.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
        }))
      : [newLineItem()],
  );
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [design, setDesign] = React.useState<InvoiceDesign>({
    logoUrl: null,
    primaryColor: "#111827",
    titleFont: "helvetica",
    bodyFont: "helvetica",
    footer: null,
  });

  const [paymentLinkUrl, setPaymentLinkUrl] = React.useState(invoice?.stripe_payment_link_url ?? "");
  const [stripeHostedUrl, setStripeHostedUrl] = React.useState(invoice?.stripe_hosted_url ?? "");

  const [gmailOpen, setGmailOpen] = React.useState(false);
  const [gmailTo, setGmailTo] = React.useState("");
  const [gmailMessage, setGmailMessage] = React.useState("Please find your invoice attached.");
  const [gmailSending, setGmailSending] = React.useState(false);

  // Fetch profile + design for PDF (edit mode)
  React.useEffect(() => {
    if (mode !== "edit") return;
    supabase
      .from("profiles")
      .select(
        "company_name, phone, email, stripe_connect_account_id, stripe_connect_charges_enabled, invoice_logo_url, invoice_primary_color, invoice_title_font, invoice_body_font, invoice_footer",
      )
      .eq("id", userId)
      .single()
      .then(({ data }: { data: ProfileDesignRow | null }) => {
        if (!data) return;
        setProfile({
          company_name: data.company_name,
          phone: data.phone,
          email: data.email,
          stripe_connect_account_id: data.stripe_connect_account_id,
          stripe_connect_charges_enabled: data.stripe_connect_charges_enabled,
        });
        setDesign({
          logoUrl: data.invoice_logo_url,
          primaryColor: data.invoice_primary_color ?? "#111827",
          titleFont: (data.invoice_title_font as InvoiceDesign["titleFont"]) ?? "helvetica",
          bodyFont: (data.invoice_body_font as InvoiceDesign["bodyFont"]) ?? "helvetica",
          footer: data.invoice_footer,
        });
      });
  }, [mode, userId]);

  React.useEffect(() => {
    if (!invoice) return;
    setPaymentLinkUrl(invoice.stripe_payment_link_url ?? "");
    setStripeHostedUrl(invoice.stripe_hosted_url ?? "");
  }, [invoice?.stripe_payment_link_url, invoice?.stripe_hosted_url]);

  // Computed totals
  const subtotal = lineItems.reduce((acc, it) => acc + (parseFloat(it.total) || 0), 0);
  const taxAmount = (subtotal * (parseFloat(taxRate) || 0)) / 100;
  const total = subtotal + taxAmount;

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;

  // ── Line item helpers ──────────────────────────────────────────────────────

  function updateLineItem(id: string, field: keyof Omit<LineItem, "_id">, value: string) {
    setLineItems((prev) =>
      prev.map((it) => {
        if (it._id !== id) return it;
        const updated = { ...it, [field]: value };
        updated.total = calcLineTotal(
          field === "quantity" ? value : updated.quantity,
          field === "unit_price" ? value : updated.unit_price,
        );
        return updated;
      }),
    );
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, newLineItem()]);
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((it) => it._id !== id) : prev));
  }

  function applyPriceBookItem(lineId: string, itemName: string) {
    const pb = priceBook.find(
      (p) => p.item_name.toLowerCase() === itemName.toLowerCase(),
    );
    if (!pb) return;
    setLineItems((prev) =>
      prev.map((it) => {
        if (it._id !== lineId) return it;
        const qty = parseFloat(it.quantity) || 1;
        const up = parseFloat(pb.unit_price) || 0;
        return {
          ...it,
          description: pb.item_name,
          unit_price: String(up),
          total: String(qty * up),
        };
      }),
    );
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function sendGmail() {
    if (!invoice?.id) return;
    if (!gmailTo.trim()) {
      toast.error("Recipient email required");
      return;
    }
    setGmailSending(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send-gmail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: gmailTo.trim(), message: gmailMessage }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Send failed");
      toast.success("Sent via Gmail");
      setGmailOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setGmailSending(false);
    }
  }

  async function save(overrideStatus?: InvoiceStatus) {
    if (!projectId) { toast.error("Please select a project"); return; }
    setSaving(true);
    try {
      const finalStatus = overrideStatus ?? status;
      const payload = {
        project_id: projectId,
        user_id: userId,
        invoice_number: invoiceNumber,
        status: finalStatus,
        notes: notes.trim() || null,
        subtotal: String(subtotal),
        tax_rate: String(parseFloat(taxRate) || 0),
        tax_amount: String(taxAmount),
        total: String(total),
      };

      if (mode === "create") {
        const { data, error } = await supabase
          .from("invoices")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;

        const itemsPayload = lineItems.map((it, idx) => ({
          invoice_id: data.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
          sort_order: idx,
        }));
        const { error: liErr } = await supabase.from("invoice_items").insert(itemsPayload);
        if (liErr) throw liErr;

        toast.success("Invoice saved");
        router.push(`/dashboard/invoices/${data.id}`);
      } else {
        const { error } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", invoice!.id)
          .eq("user_id", userId);
        if (error) throw error;

        await supabase.from("invoice_items").delete().eq("invoice_id", invoice!.id);
        const itemsPayload = lineItems.map((it, idx) => ({
          invoice_id: invoice!.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
          sort_order: idx,
        }));
        if (itemsPayload.length > 0) {
          const { error: liErr } = await supabase.from("invoice_items").insert(itemsPayload);
          if (liErr) throw liErr;
        }

        if (overrideStatus) setStatus(overrideStatus);

        // Auto-sync to Stripe Invoices API when total > 0 and Stripe is connected
        if (total > 0 && profile?.stripe_connect_charges_enabled) {
          try {
            const syncRes = await fetch(`/api/invoices/${invoice!.id}/sync-stripe`, { method: "POST" });
            const syncJson = (await syncRes.json()) as { hosted_url?: string; error?: string };
            if (syncRes.ok && syncJson.hosted_url) {
              setStripeHostedUrl(syncJson.hosted_url);
            } else if (syncJson.error) {
              console.warn("[sync-stripe]", syncJson.error);
            }
          } catch {
            // non-blocking — invoice is saved regardless
          }
        }

        toast.success("Invoice saved");
        router.refresh();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await supabase.from("invoice_items").delete().eq("invoice_id", invoice!.id);
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoice!.id)
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Invoice deleted");
      router.push("/dashboard/invoices");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete invoice");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>{mode === "create" ? ti.newInvoice : ti.editInvoice}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(status)}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
              <span className="text-sm text-slate-500 font-mono">{invoiceNumber}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-2">
            <Label>{ti.project} *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={ti.selectProject} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.client_name ? ` — ${p.client_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{ti.status}</Label>
            <div className="flex items-center gap-2">
              {mode === "edit" && profile !== undefined && (
                profile?.stripe_connect_charges_enabled ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Stripe
                  </span>
                ) : (
                  <a
                    href="/dashboard/settings"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:border-primary/50 hover:text-primary transition-colors shrink-0"
                  >
                    Stripe
                  </a>
                )
              )}
              <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{ti.draft}</SelectItem>
                  <SelectItem value="sent">{ti.sent}</SelectItem>
                  <SelectItem value="paid">{ti.paid}</SelectItem>
                  <SelectItem value="cancelled">{ti.cancelled}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col gap-2">
            <Label>{ti.notes}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {mode === "edit" && (stripeHostedUrl || paymentLinkUrl) && (
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <Label className="text-xs text-slate-500">Stripe payment link</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={stripeHostedUrl || paymentLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary break-all underline"
                >
                  {stripeHostedUrl || paymentLinkUrl}
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(stripeHostedUrl || paymentLinkUrl);
                    toast.success("Link copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client info (read-only from project) */}
      {selectedProject && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              {ti.clientInfo}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-300">
            {selectedProject.client_name && (
              <div><span className="font-medium">{ti.client}:</span> {selectedProject.client_name}</div>
            )}
            {selectedProject.address && (
              <div><span className="font-medium">{tp.address}:</span> {selectedProject.address}</div>
            )}
            {(selectedProject.city || selectedProject.state) && (
              <div>
                <span className="font-medium">{tp.city}/{tp.state}:</span>{" "}
                {[selectedProject.city, selectedProject.state, selectedProject.zip].filter(Boolean).join(", ")}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle>{tp.lineItems}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {priceBook.length > 0 && (
            <datalist id="pricebook-list">
              {priceBook.map((pb) => (
                <option key={pb.id} value={pb.item_name} />
              ))}
            </datalist>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-2 w-full">{ti.description}</th>
                  <th className="pb-2 pr-2 w-20">{ti.qty}</th>
                  <th className="pb-2 pr-2 w-28">{ti.unitPrice}</th>
                  <th className="pb-2 pr-2 w-28">{ti.lineTotal}</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lineItems.map((item) => (
                  <tr key={item._id}>
                    <td className="py-2 pr-2">
                      <Input
                        value={item.description}
                        onChange={(e) => updateLineItem(item._id, "description", e.target.value)}
                        onBlur={(e) => applyPriceBookItem(item._id, e.target.value)}
                        list="pricebook-list"
                        placeholder={ti.description}
                        className="text-sm"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item._id, "quantity", e.target.value)}
                        className="text-sm"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(item._id, "unit_price", e.target.value)}
                          className="text-sm pl-5"
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="px-2 py-2 text-slate-700 dark:text-slate-300 font-mono text-sm">
                        {fmt(parseFloat(item.total) || 0)}
                      </div>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => removeLineItem(item._id)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        disabled={lineItems.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addLineItem}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline w-fit"
          >
            <Plus className="w-4 h-4" /> {ti.addItem}
          </button>

          {/* Totals */}
          <div className="flex flex-col items-end gap-2 border-t border-slate-200 pt-4">
            <div className="w-64 flex flex-col gap-1.5">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>{ti.subtotal}</span>
                <span className="font-mono">{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span>{ti.taxRate}</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-20 h-7 text-sm text-right"
                />
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>{ti.taxAmount}</span>
                  <span className="font-mono">{fmt(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                <span>{ti.grandTotal}</span>
                <span className="font-mono">{fmt(total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {mode === "edit" && (
            <>
              {status === "draft" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void save("sent")}
                  disabled={saving}
                >
                  {ti.markAsSent}
                </Button>
              )}
              {status === "sent" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void save("paid")}
                  disabled={saving}
                >
                  {ti.markAsPaid}
                </Button>
              )}
              <PdfExportButton
                invoice={{
                  invoice_number: invoiceNumber,
                  status,
                  notes: notes || null,
                  subtotal: String(subtotal),
                  tax_rate: String(parseFloat(taxRate) || 0),
                  tax_amount: String(taxAmount),
                  total: String(total),
                  created_at: invoice?.created_at,
                }}
                project={selectedProject}
                profile={profile}
                design={design}
                items={lineItems}
                stripePaymentLinkUrl={stripeHostedUrl || paymentLinkUrl || null}
                alternatePaymentInstructions={null}
              />
              {status === "sent" && invoice && (
                <Dialog open={gmailOpen} onOpenChange={setGmailOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" className="gap-1.5">
                      <Mail className="w-4 h-4" />
                      Send via Gmail
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Send invoice PDF</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 py-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="inv-gmail-to">To</Label>
                        <Input
                          id="inv-gmail-to"
                          type="email"
                          value={gmailTo}
                          onChange={(e) => setGmailTo(e.target.value)}
                          placeholder="client@email.com"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="inv-gmail-msg">Message</Label>
                        <Textarea
                          id="inv-gmail-msg"
                          value={gmailMessage}
                          onChange={(e) => setGmailMessage(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="secondary" onClick={() => setGmailOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="button" disabled={gmailSending} onClick={() => void sendGmail()}>
                        {gmailSending ? "Sending…" : "Send"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="danger">
                    {ti.deleteInvoice}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{ti.deleteConfirmTitle}</DialogTitle>
                    <DialogDescription>
                      {ti.deleteConfirmDesc}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="secondary" type="button" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                      {ti.cancel}
                    </Button>
                    <Button variant="danger" type="button" onClick={() => void onDelete()} disabled={deleting}>
                      {deleting ? ti.deleting : ti.delete}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/dashboard/invoices")}
            disabled={saving}
          >
            {ti.cancel}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? ti.saving : mode === "create" ? tp.saveDraft : ti.saveInvoice}
          </Button>
        </div>
      </div>
    </div>
  );
}
