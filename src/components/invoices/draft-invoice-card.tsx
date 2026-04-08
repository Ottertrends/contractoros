"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, BookOpen, X, Mail, Send } from "lucide-react";

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
import { PriceBookLineInput } from "./price-book-line-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// jsPDF must never be SSR'd
const PdfExportButton = dynamic(
  () =>
    import("./pdf-export-button").then((m) => ({ default: m.PdfExportButton })),
  { ssr: false, loading: () => <span className="text-xs text-slate-400">Loading PDF…</span> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemRow {
  _id: string;
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
}

interface Props {
  projectName: string;
  invoice: Invoice;
  items: InvoiceItem[];
  priceBook: PriceBookItem[];
  project: Project;
  userId: string;
}

type ProfileRow = {
  company_name: string | null;
  phone: string | null;
  email: string | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_charges_enabled?: boolean | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function calcRowTotal(qty: string, price: string): string {
  return String((parseFloat(qty) || 0) * (parseFloat(price) || 0));
}

function newRow(description = "", qty = "1", price = "0"): LineItemRow {
  return {
    _id: crypto.randomUUID(),
    description,
    quantity: qty,
    unit_price: price,
    total: calcRowTotal(qty, price),
  };
}

function statusVariant(
  s: InvoiceStatus,
): "neutral" | "warning" | "success" | "danger" {
  const map: Record<InvoiceStatus, "neutral" | "warning" | "success" | "danger"> = {
    draft: "neutral",
    open: "warning",
    sent: "warning",
    paid: "success",
    void: "danger",
    uncollectible: "danger",
  };
  return map[s] ?? "neutral";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DraftInvoiceCard({
  projectName,
  invoice,
  items,
  priceBook,
  project,
  userId,
}: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const ti = t.invoices;

  // ── Invoice header state ──
  const [status, setStatus] = React.useState<InvoiceStatus>(invoice.status);
  const [date, setDate] = React.useState(
    invoice.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = React.useState(invoice.notes ?? "");
  const [taxRate, setTaxRate] = React.useState(
    invoice.tax_rate ? String(parseFloat(invoice.tax_rate)) : "0",
  );
  const [automaticTaxEnabled, setAutomaticTaxEnabled] = React.useState(
    !!(invoice.automatic_tax_enabled),
  );
  const [paymentLinkUrl, setPaymentLinkUrl] = React.useState(
    invoice.stripe_payment_link_url ?? "",
  );
  const [stripeHostedUrl, setStripeHostedUrl] = React.useState(
    invoice.stripe_hosted_url ?? "",
  );

  // ── Line items ──
  const [rows, setRows] = React.useState<LineItemRow[]>(() =>
    items.length > 0
      ? items.map((it) => ({
          _id: it.id || crypto.randomUUID(),
          description: it.description || it.name || "",
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
        }))
      : [newRow(projectName)],
  );

  // ── UI state ──
  const [saving, setSaving] = React.useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = React.useState(false);
  const [sendDialogMode, setSendDialogMode] = React.useState<"stripe" | "email" | null>(null);
  const [sendDialogCc, setSendDialogCc] = React.useState("");

  // Price book picker modal
  const [pbOpen, setPbOpen] = React.useState(false);
  const [pbSearch, setPbSearch] = React.useState("");

  // Profile + design settings (fetched once)
  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [design, setDesign] = React.useState<InvoiceDesign>({
    logoUrl: null,
    primaryColor: "#111827",
    titleFont: "helvetica",
    bodyFont: "helvetica",
    footer: null,
  });

  React.useEffect(() => {
    supabase
      .from("profiles")
      .select(
        "company_name, phone, email, stripe_connect_account_id, stripe_connect_charges_enabled",
      )
      .eq("id", userId)
      .single()
      .then(({ data }: { data: ProfileRow | null }) => {
        if (data) setProfile(data);
      });

    supabase
      .from("profiles")
      .select(
        "invoice_logo_url, invoice_primary_color, invoice_title_font, invoice_body_font, invoice_footer",
      )
      .eq("id", userId)
      .single()
      .then(
        ({
          data,
        }: {
          data: {
            invoice_logo_url: string | null;
            invoice_primary_color: string | null;
            invoice_title_font: string | null;
            invoice_body_font: string | null;
            invoice_footer: string | null;
          } | null;
        }) => {
          if (data) {
            setDesign({
              logoUrl: data.invoice_logo_url,
              primaryColor: data.invoice_primary_color ?? "#111827",
              titleFont:
                (data.invoice_title_font as InvoiceDesign["titleFont"]) ??
                "helvetica",
              bodyFont:
                (data.invoice_body_font as InvoiceDesign["bodyFont"]) ??
                "helvetica",
              footer: data.invoice_footer,
            });
          }
        },
      );
  }, [userId]);

  React.useEffect(() => {
    setPaymentLinkUrl(invoice.stripe_payment_link_url ?? "");
    setStripeHostedUrl(invoice.stripe_hosted_url ?? "");
  }, [invoice.stripe_payment_link_url, invoice.stripe_hosted_url]);

  // ── Computed totals ──
  const subtotal = rows.reduce(
    (sum, r) =>
      sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0),
    0,
  );
  const taxAmount = (subtotal * (parseFloat(taxRate) || 0)) / 100;
  const total = subtotal + taxAmount;

  const stripeConnected = !!(profile?.stripe_connect_charges_enabled);

  // ── Line item helpers ──

  function updateRow(
    id: string,
    field: keyof Omit<LineItemRow, "_id">,
    value: string,
  ) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        const updated = { ...r, [field]: value };
        updated.total = calcRowTotal(
          field === "quantity" ? value : updated.quantity,
          field === "unit_price" ? value : updated.unit_price,
        );
        return updated;
      }),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r._id !== id) : prev,
    );
  }

  function selectPriceBookItem(rowId: string, item: PriceBookItem) {
    const label = item.unit
      ? `${item.item_name} (${item.unit})`
      : item.item_name;
    const price = String(parseFloat(item.unit_price) || 0);
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== rowId) return r;
        return {
          ...r,
          description: label,
          unit_price: price,
          total: calcRowTotal(r.quantity, price),
        };
      }),
    );
  }

  function addFromPriceBook(item: PriceBookItem) {
    const price = String(parseFloat(item.unit_price) || 0);
    const label = item.unit
      ? `${item.item_name} (${item.unit})`
      : item.item_name;
    setRows((prev) => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        description: label,
        quantity: "1",
        unit_price: price,
        total: price,
      },
    ]);
    setPbOpen(false);
    setPbSearch("");
  }

  // ── Shared: persist invoice data to DB (header + line items) ──

  async function persistInvoiceData(overrideStatus?: InvoiceStatus) {
    const finalStatus = overrideStatus ?? status;

    const { error: invErr } = await supabase
      .from("invoices")
      .update({
        date,
        status: finalStatus,
        notes: notes.trim() || null,
        subtotal: String(subtotal),
        tax_rate: String(parseFloat(taxRate) || 0),
        tax_amount: String(taxAmount),
        total: String(total),
        automatic_tax_enabled: automaticTaxEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    if (invErr) throw new Error(invErr.message);

    await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);

    const { error: itemErr } = await supabase.from("invoice_items").insert(
      rows.map((r, idx) => ({
        invoice_id: invoice.id,
        name: r.description || null,
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
        total: r.total,
        sort_order: idx,
      })),
    );

    if (itemErr) throw new Error(itemErr.message);

    return finalStatus;
  }

  // ── Save ──

  async function handleSave(overrideStatus?: InvoiceStatus) {
    setSaving(true);
    try {
      const finalStatus = await persistInvoiceData(overrideStatus);

      if (overrideStatus) setStatus(overrideStatus);

      // Auto-sync to Stripe as DRAFT when Stripe is connected and status is draft
      if (stripeConnected && finalStatus === "draft") {
        if (automaticTaxEnabled && !project.address) {
          toast.warning(
            "Add an address to the project to enable auto-tax on Stripe.",
          );
        } else {
          try {
            const syncRes = await fetch(
              `/api/invoices/${invoice.id}/sync-stripe`,
              { method: "POST" },
            );
            const syncJson = (await syncRes.json()) as {
              hosted_url?: string;
              error?: string;
            };
            if (syncRes.ok && syncJson.hosted_url) {
              setStripeHostedUrl(syncJson.hosted_url);
            } else if (syncJson.error) {
              console.warn("[sync-stripe]", syncJson.error);
            }
          } catch {
            // non-blocking — invoice is saved regardless
          }
        }
      }

      // If status changed from open/sent → paid or uncollectible, update Stripe too
      if (stripeConnected && (invoice.status === "open" || invoice.status === "sent")) {
        if (finalStatus === "paid") {
          try { await fetch(`/api/invoices/${invoice.id}/mark-paid`, { method: "POST" }); } catch { /* non-blocking */ }
        } else if (finalStatus === "uncollectible") {
          try { await fetch(`/api/invoices/${invoice.id}/uncollectible`, { method: "POST" }); } catch { /* non-blocking */ }
        }
      }

      toast.success("Invoice saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Finalize (Draft → Open) ──

  async function handleFinalize() {
    setSaving(true);
    try {
      // Persist current invoice data first
      await persistInvoiceData();

      // Call finalize route — handles Stripe + sets status to "open" in DB
      const res = await fetch(`/api/invoices/${invoice.id}/finalize`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        hosted_url?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Finalize failed");

      if (j.hosted_url) setStripeHostedUrl(j.hosted_url);
      setStatus("open");
      toast.success(
        stripeConnected
          ? "Invoice finalized — payment link generated."
          : "Invoice finalized.",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to finalize invoice");
    } finally {
      setSaving(false);
    }
  }

  // ── Void ──

  async function handleVoid() {
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/void`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        new_invoice_id?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Void failed");
      toast.success("Invoice voided. A new draft has been created.");
      // Navigate to the new draft if we got its id, otherwise go back to the project page
      if (j.new_invoice_id) {
        router.push(`/dashboard/projects/${project.id}`);
      } else {
        router.push(`/dashboard/projects/${project.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to void invoice");
      setSaving(false);
    }
  }

  // ── Uncollectible ──

  async function handleUncollectible() {
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/uncollectible`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setStatus("uncollectible");
      toast.success("Invoice marked as uncollectible.");
      router.refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to mark uncollectible",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Open Send Stripe dialog ──
  function openSendStripeDialog() {
    if (!project.client_email) {
      toast.error("Add a client email to the project before sending via Stripe.");
      return;
    }
    setSendDialogCc("");
    setSendDialogMode("stripe");
  }

  // ── Open Send Email dialog ──
  function openSendEmailDialog() {
    if (!project.client_email) {
      toast.error("Please add client email in the Edit Project form.");
      return;
    }
    setSendDialogCc("");
    setSendDialogMode("email");
  }

  // ── Confirm Send (from dialog) ──
  async function handleConfirmSend() {
    const mode = sendDialogMode;
    setSendDialogMode(null);
    setSaving(true);
    try {
      if (mode === "stripe") {
        const res = await fetch(`/api/invoices/${invoice.id}/send-stripe`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { error?: string; hosted_url?: string };
        if (!res.ok) throw new Error(j.error ?? "Stripe send failed");
        setStatus("sent");
        if (j.hosted_url) setStripeHostedUrl(j.hosted_url);
        toast.success("Invoice sent via Stripe — your client will receive an email.");
        router.refresh();
      } else if (mode === "email") {
        const subject = `Invoice ${invoice.invoice_number ?? ""} — ${profile?.company_name ?? ""}`;
        const payLink = stripeHostedUrl || paymentLinkUrl;
        const body = [
          "Hi,",
          "",
          "Please find your invoice attached.",
          "",
          ...(payLink ? [`Pay online: ${payLink}`, ""] : []),
          "Best regards,",
          profile?.company_name ?? "",
        ].join("\n");
        let mailtoUrl = `mailto:${project.client_email ?? ""}`;
        const params: string[] = [];
        if (sendDialogCc.trim()) params.push(`cc=${encodeURIComponent(sendDialogCc.trim())}`);
        params.push(`subject=${encodeURIComponent(subject)}`);
        params.push(`body=${encodeURIComponent(body)}`);
        mailtoUrl += `?${params.join("&")}`;
        // Open mail client via hidden anchor
        const a = document.createElement("a");
        a.href = mailtoUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Update status to "sent"
        await supabase.from("invoices").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", invoice.id);
        setStatus("sent");
        toast.success("Email client opened. Invoice marked as Sent.");
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invoice");
    } finally {
      setSaving(false);
    }
  }

  // Filtered price book items for modal
  const filteredPb = React.useMemo(() => {
    if (!pbSearch.trim()) return priceBook;
    const lower = pbSearch.toLowerCase();
    return priceBook.filter(
      (pb) =>
        pb.item_name.toLowerCase().includes(lower) ||
        (pb.category ?? "").toLowerCase().includes(lower) ||
        (pb.description ?? "").toLowerCase().includes(lower),
    );
  }, [priceBook, pbSearch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Price Book Picker Modal */}
      {pbOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-lg flex flex-col gap-0 overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-50">
                  Add from Price Book
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Click any item to add it as a line
                </div>
              </div>
              <button
                onClick={() => {
                  setPbOpen(false);
                  setPbSearch("");
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <input
                autoFocus
                value={pbSearch}
                onChange={(e) => setPbSearch(e.target.value)}
                placeholder="Search items, categories…"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="overflow-y-auto max-h-72">
              {filteredPb.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">
                  {priceBook.length === 0
                    ? "No items in your price book yet. Add them at Price Book."
                    : "No items match your search."}
                </div>
              ) : (
                filteredPb.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addFromPriceBook(item)}
                    className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">
                        {item.item_name}
                        {item.unit && (
                          <span className="ml-1.5 text-xs text-slate-400">
                            / {item.unit}
                          </span>
                        )}
                      </div>
                      {item.category && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {item.category}
                        </div>
                      )}
                    </div>
                    <div className="ml-4 shrink-0 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {fmt(parseFloat(item.unit_price) || 0)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Dialog */}
      {voidConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-50 text-base mb-1">
                Void this invoice?
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Voiding permanently destroys this finalized invoice
                {stripeConnected ? " in both WorkSupp and Stripe" : ""}. This action{" "}
                <strong>cannot be undone</strong>. A new blank draft will be
                created for this project so you can start fresh.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVoidConfirmOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white border-0"
                onClick={() => {
                  setVoidConfirmOpen(false);
                  void handleVoid();
                }}
                disabled={saving}
              >
                Yes, void invoice
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Confirmation Dialog */}
      {sendDialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-50 text-base mb-1">
                {sendDialogMode === "stripe" ? "Send Invoice via Stripe" : "Send Invoice via Email"}
              </div>
              <p className="text-sm text-slate-500">
                {sendDialogMode === "stripe"
                  ? "Stripe will email the invoice and payment link to your client."
                  : "Your email client will open pre-filled with the invoice details."}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">To</label>
                <div className="px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  {project.client_email}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">CC (optional)</label>
                <input
                  type="email"
                  value={sendDialogCc}
                  onChange={(e) => setSendDialogCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSendDialogMode(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleConfirmSend()}
                disabled={saving}
              >
                {sendDialogMode === "stripe" ? "Send via Stripe" : "Open Email Client"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <CardTitle>Invoice</CardTitle>
              <Badge variant={statusVariant(status)}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
              {invoice.invoice_number && (
                <span className="text-xs font-mono text-slate-500">
                  {invoice.invoice_number}
                </span>
              )}
            </div>

            {/* Status selector + Stripe indicator */}
            <div className="flex items-center gap-2">
              {stripeConnected ? (
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
              )}
              <Select
                value={status}
                onValueChange={(v) => {
                  if (status === "draft") {
                    toast.info("Use 'Finalize Invoice' to change from Draft status.");
                    return;
                  }
                  if (v === "draft") {
                    toast.error("Invoice already finalized. Use the Void button to return to Draft.");
                    return;
                  }
                  if (v === "void" && status !== "void") {
                    setVoidConfirmOpen(true);
                    return;
                  }
                  setStatus(v as InvoiceStatus);
                }}
                disabled={status === "draft"}
              >
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                  <SelectItem value="uncollectible">Uncollectible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {/* Date + Project Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-date" className="text-xs text-slate-500">
                {ti.invoiceDate}
              </Label>
              <Input
                id="inv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-500">
                {t.projects.projectName.replace(" *", "")}
              </Label>
              <div className="px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-sm border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                {projectName}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t.projects.lineItems}
            </div>

            <div className="hidden sm:grid sm:grid-cols-[3fr_1fr_1.2fr_1fr_auto] gap-2 text-xs text-slate-400 px-1">
              <span className="flex items-center gap-2">
                Product / Service
                {priceBook.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPbOpen(true)}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline normal-case tracking-normal"
                  >
                    <BookOpen className="w-3 h-3" />
                    Add from Price Book
                  </button>
                )}
              </span>
              <span>{t.projects.qty}</span>
              <span>{t.projects.unitPrice}</span>
              <span className="text-right">{ti.lineTotal}</span>
              <span />
            </div>

            {rows.map((row) => (
              <div
                key={row._id}
                className="grid grid-cols-1 sm:grid-cols-[3fr_1fr_1.2fr_1fr_auto] gap-2 items-center"
              >
                <div>
                  <Label className="sm:hidden text-xs text-slate-400">
                    Product / Service
                  </Label>
                  <PriceBookLineInput
                    value={row.description}
                    onChange={(v) => updateRow(row._id, "description", v)}
                    onSelect={(item) => selectPriceBookItem(row._id, item)}
                    priceBook={priceBook}
                  />
                </div>
                <div>
                  <Label className="sm:hidden text-xs text-slate-400">
                    {t.projects.qty}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="1"
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(row._id, "quantity", e.target.value)
                    }
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="sm:hidden text-xs text-slate-400">
                    {t.projects.unitPrice}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                      $
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={row.unit_price}
                      onChange={(e) =>
                        updateRow(row._id, "unit_price", e.target.value)
                      }
                      className="text-sm pl-5"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end sm:justify-start gap-2">
                  <Label className="sm:hidden text-xs text-slate-400 mr-1">
                    {ti.lineTotal}
                  </Label>
                  <span className="text-sm font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {fmt(
                      (parseFloat(row.quantity) || 0) *
                        (parseFloat(row.unit_price) || 0),
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => removeRow(row._id)}
                    disabled={rows.length === 1}
                    className="text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors p-1"
                    title="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addRow}
              className="self-start flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.projects.addLineItem}
            </button>
          </div>

          {/* Totals */}
          <div className="flex flex-col items-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
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

              {/* Stripe auto-tax — only visible when Stripe is connected */}
              {stripeConnected && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={automaticTaxEnabled}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const hasAddress =
                          project.address &&
                          project.city &&
                          project.state &&
                          project.zip;
                        if (!hasAddress) {
                          toast.warning(
                            "Fill in the client's complete address (address, city, state, zip) in the Edit Project form before enabling auto-tax.",
                          );
                          return;
                        }
                      }
                      setAutomaticTaxEnabled(e.target.checked);
                    }}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-xs text-slate-500">Stripe auto-tax</span>
                </label>
              )}
            </div>
          </div>

          {/* Stripe payment link — visible only when Stripe connected */}
          {stripeConnected && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-slate-500">
                Stripe payment link
              </Label>
              {stripeHostedUrl || paymentLinkUrl ? (
                <div className="flex flex-wrap items-center gap-2">
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
                    className="shrink-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        stripeHostedUrl || paymentLinkUrl,
                      );
                      toast.success("Link copied");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Generated after finalizing the invoice.
                </p>
              )}
            </div>
          )}

          {/* Invoice Notes */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-slate-500">{t.projects.notes}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes visible on the invoice PDF…"
              rows={2}
            />
          </div>

          {/* ── Action bar ── */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Export PDF — always visible */}
              <PdfExportButton
                invoice={{
                  invoice_number: invoice.invoice_number,
                  status,
                  notes: notes || null,
                  subtotal: String(subtotal),
                  tax_rate: String(parseFloat(taxRate) || 0),
                  tax_amount: String(taxAmount),
                  total: String(total),
                  created_at: invoice.created_at,
                }}
                project={project}
                profile={profile}
                design={design}
                items={rows.map((r) => ({
                  description: r.description,
                  quantity: r.quantity,
                  unit_price: r.unit_price,
                  total: r.total,
                }))}
                stripePaymentLinkUrl={stripeHostedUrl || paymentLinkUrl || null}
                alternatePaymentInstructions={null}
              />

              {/* DRAFT: Finalize Invoice */}
              {status === "draft" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleFinalize()}
                  disabled={saving}
                  title="Finalizing locks the invoice. If Stripe is connected, it will also be finalized in Stripe and a payment link will be generated."
                >
                  Finalize Invoice
                </Button>
              )}

              {/* OPEN: Send Via Stripe (Stripe connected only) */}
              {(status === "open" || status === "sent") && stripeConnected && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={openSendStripeDialog}
                  disabled={saving || !project.client_email}
                  title={
                    !project.client_email
                      ? "Please add client email to the project first"
                      : "Send the Stripe invoice to your client via email"
                  }
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Via Stripe
                </Button>
              )}

              {/* OPEN: Send Via Email (mailto) */}
              {(status === "open" || status === "sent") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={openSendEmailDialog}
                  disabled={!project.client_email}
                  title={
                    !project.client_email
                      ? "Please add client email to the project first"
                      : "Open your email client with a pre-filled invoice email"
                  }
                >
                  <Mail className="w-3.5 h-3.5" />
                  Send Via Email
                </Button>
              )}

              {/* OPEN: Void */}
              {(status === "open" || status === "sent") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidConfirmOpen(true)}
                  disabled={saving}
                  title="Void this invoice and create a new draft"
                >
                  Void
                </Button>
              )}

              {/* OPEN: Mark as Uncollectible */}
              {(status === "open" || status === "sent") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleUncollectible()}
                  disabled={saving}
                  title="Mark this invoice as uncollectible"
                >
                  Uncollectible
                </Button>
              )}
            </div>

            {/* Save Invoice — always visible */}
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? ti.saving : ti.saveInvoice}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
