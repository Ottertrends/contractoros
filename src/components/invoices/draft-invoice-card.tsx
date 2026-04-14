"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, BookOpen, X, Mail, Send, ChevronDown, Copy, ExternalLink, Share2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import type {
  Invoice,
  InvoiceDesign,
  InvoiceItem,
  InvoiceStatus,
  PriceBookItem,
  Project,
  TaxRate,
} from "@/lib/types/database";
import { PriceBookLineInput } from "./price-book-line-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  tax_rate: string; // percentage e.g. "8.75"; "0" means no tax
  total: string;    // subtotal: qty × unit_price (pre-tax)
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
    tax_rate: "0",
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
  // Auto-tax toggle removed — always disabled (per-line tax rates are used instead)
  const automaticTaxEnabled = false;
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
          tax_rate: it.tax_rate ? String(parseFloat(it.tax_rate)) : "0",
          total: it.total,
        }))
      : [newRow(projectName)],
  );

  // ── User tax rates (for dropdown) ──
  const [userTaxRates, setUserTaxRates] = React.useState<TaxRate[]>([]);
  // Modal for saving a new tax rate from within the invoice (Custom… option)
  const [newRateModal, setNewRateModal] = React.useState<{
    rowId: string;
    name: string;
    rate: string;
    saving: boolean;
  } | null>(null);

  // ── Stripe invoice number + edit count + invoice ID ──
  const [stripeInvoiceNumber, setStripeInvoiceNumber] = React.useState<string | null>(
    invoice.stripe_invoice_number ?? null,
  );
  const [openEditCount, setOpenEditCount] = React.useState<number>(
    invoice.open_edit_count ?? 0,
  );
  const [stripeInvoiceId, setStripeInvoiceId] = React.useState<string | null>(
    invoice.stripe_invoice_id ?? null,
  );

  // ── UI state ──
  const [saving, setSaving] = React.useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = React.useState(false);
  const [sendDialogMode, setSendDialogMode] = React.useState<"stripe" | "email" | null>(null);
  const [sendDialogCc, setSendDialogCc] = React.useState("");
  // Status-change popup
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [selectedStatusOption, setSelectedStatusOption] = React.useState<InvoiceStatus | null>(null);

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
    // Fetch user's saved tax rates for the line item dropdown
    fetch("/api/tax-rates")
      .then((r) => r.json())
      .then((j: { tax_rates?: TaxRate[] }) => setUserTaxRates(j.tax_rates ?? []))
      .catch(() => {});

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

  // Per-line tax: sum of (line_subtotal × line_tax_rate / 100) across all rows
  const lineTaxTotal = rows.reduce((sum, r) => {
    const lineSubtotal = (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0);
    const lineTaxPct = parseFloat(r.tax_rate) || 0;
    return sum + (lineSubtotal * lineTaxPct) / 100;
  }, 0);

  // Use per-line tax if any row has a non-zero tax; otherwise fall back to invoice-level taxRate
  const hasLineTax = rows.some((r) => (parseFloat(r.tax_rate) || 0) > 0);
  const taxAmount = hasLineTax ? lineTaxTotal : (subtotal * (parseFloat(taxRate) || 0)) / 100;
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
        // Recalculate pre-tax subtotal only when qty or price changes
        if (field === "quantity" || field === "unit_price") {
          updated.total = calcRowTotal(
            field === "quantity" ? value : updated.quantity,
            field === "unit_price" ? value : updated.unit_price,
          );
        }
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
        tax_rate: "0",
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
        tax_rate: parseFloat(r.tax_rate) || 0,
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
      // Special case: saving an OPEN invoice → void + re-sync + re-finalize (up to 3x)
      if (status === "open" && stripeConnected && !overrideStatus) {
        if (openEditCount >= 3) {
          toast.error(
            "You've reached the 3-edit limit on this open invoice. Please void it and create a new one.",
          );
          return;
        }
        // Persist data to DB first so re-open picks up latest line items
        await persistInvoiceData();
        const res = await fetch(`/api/invoices/${invoice.id}/re-open`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          hosted_url?: string;
          stripe_invoice_number?: string | null;
          stripe_invoice_id?: string | null;
          open_edit_count?: number;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error ?? "Re-open failed");
        if (j.hosted_url) setStripeHostedUrl(j.hosted_url);
        if (j.stripe_invoice_number) setStripeInvoiceNumber(j.stripe_invoice_number);
        if (j.stripe_invoice_id) setStripeInvoiceId(j.stripe_invoice_id);
        if (typeof j.open_edit_count === "number") setOpenEditCount(j.open_edit_count);
        toast.success(`Invoice updated. (${j.open_edit_count ?? openEditCount + 1}/3 edits used)`);
        router.refresh();
        return;
      }

      // Special case: saving an UNCOLLECTIBLE invoice → void Stripe + create new draft
      if (status === "uncollectible") {
        await persistInvoiceData();
        const res = await fetch(`/api/invoices/${invoice.id}/void`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Failed to reset invoice");
        toast.success("Invoice reset to draft. You can now re-finalize it.");
        window.location.href = `/dashboard/projects/${project.id}`;
        return;
      }

      const finalStatus = await persistInvoiceData(overrideStatus);
      if (overrideStatus) setStatus(overrideStatus);

      // Auto-sync to Stripe as DRAFT when Stripe is connected and status is draft
      if (stripeConnected && finalStatus === "draft") {
        if (automaticTaxEnabled && !project.address) {
          toast.warning("Add an address to the project to enable auto-tax on Stripe.");
        } else {
          try {
            const syncRes = await fetch(`/api/invoices/${invoice.id}/sync-stripe`, { method: "POST" });
            const syncJson = (await syncRes.json()) as { hosted_url?: string; error?: string };
            if (syncRes.ok && syncJson.hosted_url) setStripeHostedUrl(syncJson.hosted_url);
          } catch { /* non-blocking */ }
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
        stripe_invoice_number?: string | null;
        stripe_invoice_id?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Finalize failed");

      if (j.hosted_url) setStripeHostedUrl(j.hosted_url);
      if (j.stripe_invoice_number) setStripeInvoiceNumber(j.stripe_invoice_number);
      if (j.stripe_invoice_id) setStripeInvoiceId(j.stripe_invoice_id);
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
      window.location.href = `/dashboard/projects/${project.id}`;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to void invoice");
    } finally {
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

  // ── Clear Invoice (draft only) ──

  async function handleClearInvoice() {
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      setRows([newRow()]);
      setTaxRate("0");
      setDate(today);
      // Persist cleared state to DB
      const { error: invErr } = await supabase
        .from("invoices")
        .update({
          date: today,
          status: "draft",
          subtotal: "0",
          tax_rate: "0",
          tax_amount: "0",
          total: "0",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);
      if (invErr) throw new Error(invErr.message);
      await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);
      // Re-sync Stripe draft so it also clears in Stripe
      if (stripeConnected) {
        try {
          await fetch(`/api/invoices/${invoice.id}/sync-stripe`, { method: "POST" });
        } catch { /* non-blocking */ }
      }
      toast.success("Invoice cleared.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear invoice");
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
      }
      // Email mode is handled via the anchor tag in the dialog (see render below)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invoice");
    } finally {
      setSaving(false);
    }
  }

  // ── Shared email subject + body (used by all three compose URL memos) ──
  // Stripe invoice number takes priority; fall back to internal invoice number
  const emailSubject = React.useMemo(
    () => `New invoice from ${profile?.company_name ?? ""} #${stripeInvoiceNumber ?? invoice.invoice_number ?? ""}`,
    [stripeInvoiceNumber, invoice.invoice_number, profile?.company_name],
  );
  const emailBody = React.useMemo(() => {
    const payLink = stripeHostedUrl || paymentLinkUrl;
    return [
      `Hi,`,
      "",
      `${profile?.company_name ?? "Your service provider"} has sent you an invoice.`,
      "",
      ...(payLink
        ? [
            "View and pay your invoice here:",
            payLink,
            "",
          ]
        : []),
      "Thank you for your business.",
      "",
      "Best regards,",
      profile?.company_name ?? "",
    ].join("\n");
  }, [stripeHostedUrl, paymentLinkUrl, profile?.company_name]);

  // ── Build compose URLs for email dialog ──
  const mailtoUrl = React.useMemo(() => {
    if (sendDialogMode !== "email") return "";
    const params: string[] = [];
    if (sendDialogCc.trim()) params.push(`cc=${encodeURIComponent(sendDialogCc.trim())}`);
    params.push(`subject=${encodeURIComponent(emailSubject)}`);
    params.push(`body=${encodeURIComponent(emailBody)}`);
    return `mailto:${project.client_email ?? ""}?${params.join("&")}`;
  }, [sendDialogMode, sendDialogCc, emailSubject, emailBody, project.client_email]);

  const gmailUrl = React.useMemo(() => {
    if (sendDialogMode !== "email") return "";
    const p = new URLSearchParams();
    p.set("view", "cm");
    p.set("fs", "1");
    p.set("to", project.client_email ?? "");
    p.set("su", emailSubject);
    p.set("body", emailBody);
    if (sendDialogCc.trim()) p.set("cc", sendDialogCc.trim());
    return `https://mail.google.com/mail/?${p.toString()}`;
  }, [sendDialogMode, sendDialogCc, emailSubject, emailBody, project.client_email]);

  const outlookUrl = React.useMemo(() => {
    if (sendDialogMode !== "email") return "";
    const p = new URLSearchParams();
    p.set("to", project.client_email ?? "");
    p.set("subject", emailSubject);
    p.set("body", emailBody);
    if (sendDialogCc.trim()) p.set("cc", sendDialogCc.trim());
    return `https://outlook.live.com/mail/0/deeplink/compose?${p.toString()}`;
  }, [sendDialogMode, sendDialogCc, emailSubject, emailBody, project.client_email]);

  async function handleMarkEmailSent() {
    try {
      await supabase.from("invoices").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", invoice.id);
      setStatus("sent");
      setSendDialogMode(null);
      toast.success("Invoice marked as Sent.");
      router.refresh();
    } catch {
      toast.error("Failed to mark invoice as sent");
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
          <div className={`bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full ${sendDialogMode === "email" ? "max-w-md" : "max-w-sm"} border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4`}>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-50 text-base mb-1">
                {sendDialogMode === "stripe" ? "Send Invoice via Stripe" : "Send Invoice via Email"}
              </div>
              <p className="text-sm text-slate-500">
                {sendDialogMode === "stripe"
                  ? "Stripe will email the invoice and payment link to your client."
                  : "Choose how to open your email and send the invoice."}
              </p>
            </div>

            {/* To field */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">To</label>
              <div className="px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {project.client_email}
              </div>
            </div>

            {sendDialogMode === "stripe" ? (
              <p className="text-xs text-slate-400 italic">
                Stripe sends directly to your client&apos;s email. CC recipients are not supported for Stripe sends — use &ldquo;Send Via Email&rdquo; if you need to CC someone.
              </p>
            ) : (
              <>
                {/* CC field */}
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

                {/* Open-with options */}
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-2">Open with</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={gmailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      Gmail ↗
                    </a>
                    <a
                      href={outlookUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      Outlook ↗
                    </a>
                    <a
                      href={mailtoUrl}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Mail App
                    </a>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    After sending, click <strong>Mark as Sent</strong> to update the invoice status.
                  </p>
                </div>
              </>
            )}

            {/* Footer buttons */}
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
              {sendDialogMode === "email" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleMarkEmailSent()}
                  disabled={saving}
                >
                  Mark as Sent
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleConfirmSend()}
                  disabled={saving}
                >
                  Send via Stripe
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Status Change Popup ── */}
      {statusDialogOpen && (() => {
        // Available options depend on current status
        const optionsByStatus: Record<string, InvoiceStatus[]> = {
          open: ["sent", "paid", "void", "uncollectible"],
          sent: ["paid", "void", "uncollectible"],
          paid: ["void"],
          uncollectible: ["paid", "void"],
        };
        const options = optionsByStatus[status] ?? [];

        const meta: Record<string, { label: string; desc: string; caution?: string }> = {
          sent: {
            label: "Sent",
            desc: "Invoice has been sent to the client.",
          },
          paid: {
            label: "Paid",
            desc: "Payment was collected.",
            caution: "You cannot undo this action.",
          },
          void: {
            label: "Void",
            desc: "This invoice was accidentally finalized or contains a mistake.",
            caution: "You cannot undo this action.",
          },
          uncollectible: {
            label: "Uncollectible",
            desc: "Payment of this invoice is not expected. It is still possible to collect payment should your customer attempt to pay.",
            caution: "This invoice will no longer be open. After marking it as uncollectible, you'll only be able to change the status to paid or void.",
          },
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-5">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-50 text-base mb-0.5">
                  Change invoice status
                </div>
                <p className="text-sm text-slate-500">Mark invoice as…</p>
              </div>

              <div className="flex flex-col gap-3">
                {options.map((opt) => {
                  const m = meta[opt];
                  return (
                    <label
                      key={opt}
                      className="flex items-start gap-3 cursor-pointer group"
                    >
                      <input
                        type="radio"
                        name="status-option"
                        value={opt}
                        checked={selectedStatusOption === opt}
                        onChange={() => setSelectedStatusOption(opt)}
                        className="mt-0.5 accent-primary"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {m.label}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
                        {m.caution && (
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                            ⚠ Caution: {m.caution}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <a
                href="https://docs.stripe.com/invoicing/overview#invoice-statuses"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline -mt-1"
              >
                Learn more →
              </a>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStatusDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!selectedStatusOption || saving}
                  onClick={() => {
                    setStatusDialogOpen(false);
                    if (!selectedStatusOption) return;
                    if (selectedStatusOption === "void") {
                      // Void needs its own confirm dialog
                      setVoidConfirmOpen(true);
                    } else if (selectedStatusOption === "paid") {
                      void (async () => {
                        setSaving(true);
                        try {
                          const res = await fetch(`/api/invoices/${invoice.id}/mark-paid`, { method: "POST" });
                          const j = (await res.json().catch(() => ({}))) as { error?: string };
                          if (!res.ok) throw new Error(j.error ?? "Failed to mark paid");
                          setStatus("paid");
                          toast.success("Invoice marked as paid.");
                          router.refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        } finally { setSaving(false); }
                      })();
                    } else if (selectedStatusOption === "uncollectible") {
                      void (async () => {
                        setSaving(true);
                        try {
                          const res = await fetch(`/api/invoices/${invoice.id}/uncollectible`, { method: "POST" });
                          const j = (await res.json().catch(() => ({}))) as { error?: string };
                          if (!res.ok) throw new Error(j.error ?? "Failed");
                          setStatus("uncollectible");
                          toast.success("Invoice marked as uncollectible.");
                          router.refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        } finally { setSaving(false); }
                      })();
                    } else if (selectedStatusOption === "sent") {
                      void (async () => {
                        setSaving(true);
                        try {
                          await supabase.from("invoices").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", invoice.id);
                          setStatus("sent");
                          toast.success("Invoice marked as sent.");
                          router.refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        } finally { setSaving(false); }
                      })();
                    }
                  }}
                >
                  Update status
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Invoice Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle>Invoice</CardTitle>
              <Badge variant={statusVariant(status)}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
              {invoice.invoice_number && (
                <span className="text-xs font-mono text-slate-500">
                  {invoice.invoice_number}
                </span>
              )}
              {/* Stripe invoice number — shown after finalization */}
              {stripeInvoiceNumber && stripeInvoiceId && (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500">
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <a
                    href={`https://dashboard.stripe.com/${profile?.stripe_connect_account_id ?? ""}/invoices/${stripeInvoiceId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    title="Open in Stripe Dashboard"
                  >
                    Stripe: {stripeInvoiceNumber}
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(stripeInvoiceNumber);
                      toast.success("Stripe invoice number copied");
                    }}
                    title="Copy Stripe invoice number"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            {/* Stripe indicator + Status change button */}
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
              {/* Status change trigger — disabled on draft and void (terminal states) */}
              <button
                type="button"
                disabled={status === "draft" || status === "void"}
                onClick={() => {
                  setSelectedStatusOption(null);
                  setStatusDialogOpen(true);
                }}
                title={
                  status === "draft"
                    ? "Finalize the invoice to change status"
                    : status === "void"
                    ? "Void is a terminal status"
                    : "Change invoice status"
                }
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
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

            <div className="hidden sm:grid sm:grid-cols-[3fr_1fr_1.2fr_1fr_1fr_auto] gap-2 text-xs text-slate-400 px-1">
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
              <span>Tax</span>
              <span className="text-right">{ti.lineTotal}</span>
              <span />
            </div>

            {rows.map((row) => {
              const lineSubtotal = (parseFloat(row.quantity) || 0) * (parseFloat(row.unit_price) || 0);
              const lineTaxAmt = lineSubtotal * (parseFloat(row.tax_rate) || 0) / 100;
              // Determine if current tax_rate matches a saved rate (for dropdown value)
              const matchesSavedRate = userTaxRates.some((tr) => Math.abs(parseFloat(tr.rate) - parseFloat(row.tax_rate)) < 0.001);
              const dropdownValue = parseFloat(row.tax_rate) > 0 && !matchesSavedRate ? "custom-applied" : row.tax_rate;

              return (
              <div
                key={row._id}
                className="grid grid-cols-1 sm:grid-cols-[3fr_1fr_1.2fr_1fr_1fr_auto] gap-2 items-start"
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
                {/* Tax column */}
                <div className="flex flex-col gap-1">
                  <Label className="sm:hidden text-xs text-slate-400">Tax</Label>
                  <select
                    value={dropdownValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        // Open the save-and-reuse modal
                        setNewRateModal({ rowId: row._id, name: "", rate: "", saving: false });
                      } else {
                        updateRow(row._id, "tax_rate", val);
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {/* Saved rates first */}
                    {userTaxRates.map((tr) => (
                      <option key={tr.id} value={tr.rate}>
                        {tr.name} ({parseFloat(tr.rate).toFixed(2)}%)
                      </option>
                    ))}
                    <option value="0">0%</option>
                    {/* Show a display option when a custom rate is already applied */}
                    {dropdownValue === "custom-applied" && (
                      <option value="custom-applied">Custom ({parseFloat(row.tax_rate).toFixed(2)}%)</option>
                    )}
                    <option value="custom">+ Add new rate…</option>
                  </select>
                  {lineTaxAmt > 0 && (
                    <span className="text-xs text-slate-400 tabular-nums">+{fmt(lineTaxAmt)}</span>
                  )}
                </div>
                <div className="flex items-center justify-end sm:justify-start gap-2 pt-1">
                  <Label className="sm:hidden text-xs text-slate-400 mr-1">
                    {ti.lineTotal}
                  </Label>
                  <span className="text-sm font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {fmt(lineSubtotal + lineTaxAmt)}
                  </span>
                </div>
                <div className="flex items-center justify-end pt-1">
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
              );
            })}

            <button
              type="button"
              onClick={addRow}
              className="self-start flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.projects.addLineItem}
            </button>
          </div>

          {/* ── New Tax Rate Modal (Custom… shortcut) ── */}
          {newRateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-950 rounded-xl shadow-xl w-full max-w-xs border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-50 text-base mb-0.5">
                    Add Tax Rate
                  </div>
                  <p className="text-xs text-slate-500">This rate will be saved to your settings and applied to this line.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="modal-tax-name" className="text-xs text-slate-500">Name</Label>
                    <Input
                      id="modal-tax-name"
                      value={newRateModal.name}
                      onChange={(e) => setNewRateModal((m) => m ? { ...m, name: e.target.value } : m)}
                      placeholder="e.g. Texas Tax"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="modal-tax-rate" className="text-xs text-slate-500">Rate (%)</Label>
                    <div className="relative">
                      <Input
                        id="modal-tax-rate"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={newRateModal.rate}
                        onChange={(e) => setNewRateModal((m) => m ? { ...m, rate: e.target.value } : m)}
                        placeholder="e.g. 8.75"
                        className="pr-7"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setNewRateModal(null)}
                    disabled={newRateModal.saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={newRateModal.saving || !newRateModal.name.trim() || !newRateModal.rate}
                    onClick={() => {
                      const { rowId, name, rate } = newRateModal;
                      const rateNum = parseFloat(rate);
                      if (!name.trim() || isNaN(rateNum) || rateNum <= 0 || rateNum > 100) {
                        toast.error("Enter a name and a rate between 0 and 100.");
                        return;
                      }
                      setNewRateModal((m) => m ? { ...m, saving: true } : m);
                      void fetch("/api/tax-rates", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: name.trim(), rate: rateNum }),
                      })
                        .then((r) => r.json())
                        .then((j: { tax_rate?: TaxRate; error?: string }) => {
                          if (j.error) throw new Error(j.error);
                          const saved = j.tax_rate!;
                          setUserTaxRates((prev) => [...prev, saved]);
                          updateRow(rowId, "tax_rate", String(rateNum));
                          setNewRateModal(null);
                          toast.success(`Tax rate "${saved.name}" saved and applied.`);
                        })
                        .catch((err: unknown) => {
                          toast.error(err instanceof Error ? err.message : "Failed to save tax rate");
                          setNewRateModal((m) => m ? { ...m, saving: false } : m);
                        });
                    }}
                  >
                    {newRateModal.saving ? "Saving…" : "Save & Apply"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="flex flex-col items-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="w-72 flex flex-col gap-1.5">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>{ti.subtotal}</span>
                <span className="font-mono">{fmt(subtotal)}</span>
              </div>

              {/* Invoice-level tax input — only shown when no per-line tax */}
              {!hasLineTax && (
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
              )}

              {/* Per-line tax breakdown (Stripe-style) */}
              {hasLineTax && taxAmount > 0 && (() => {
                // Compute per-rate totals
                const rateMap = new Map<number, { label: string; taxableAmount: number; taxAmt: number }>();
                for (const r of rows) {
                  const pct = parseFloat(r.tax_rate) || 0;
                  if (pct === 0) continue;
                  const lineSubtotal = (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0);
                  const matched = userTaxRates.find((tr) => Math.abs(parseFloat(tr.rate) - pct) < 0.001);
                  const label = matched?.name ?? "Tax";
                  if (rateMap.has(pct)) {
                    const e = rateMap.get(pct)!;
                    e.taxableAmount += lineSubtotal;
                    e.taxAmt += lineSubtotal * pct / 100;
                  } else {
                    rateMap.set(pct, { label, taxableAmount: lineSubtotal, taxAmt: lineSubtotal * pct / 100 });
                  }
                }
                const breakdown = Array.from(rateMap.entries());
                return (
                  <>
                    <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                      <span>Total excl. tax</span>
                      <span className="font-mono">{fmt(subtotal)}</span>
                    </div>
                    {breakdown.map(([rate, b]) => (
                      <div key={rate} className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                        <span className="truncate mr-2">{b.label} ({rate}% on {fmt(b.taxableAmount)})</span>
                        <span className="font-mono shrink-0">{fmt(b.taxAmt)}</span>
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* Invoice-level tax amount row (only when invoice-level tax is set) */}
              {!hasLineTax && taxAmount > 0 && (
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
                  tax_rate: r.tax_rate,
                }))}
                savedTaxRates={userTaxRates.map((tr) => ({ name: tr.name, rate: tr.rate }))}
                stripePaymentLinkUrl={stripeHostedUrl || paymentLinkUrl || null}
                alternatePaymentInstructions={null}
              />

              {/* ── DRAFT buttons ── */}
              {status === "draft" && (
                <>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleClearInvoice()}
                    disabled={saving}
                    title="Clear line items, tax, and date — keeps notes"
                  >
                    Clear Invoice
                  </Button>
                </>
              )}

              {/* ── OPEN / SENT buttons ── */}
              {(status === "open" || status === "sent") && (
                <>
                  {stripeConnected && (
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
                </>
              )}

              {/* ── UNCOLLECTIBLE: Void + Paid ── */}
              {status === "uncollectible" && (
                <>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void (async () => {
                      setSaving(true);
                      try {
                        const res = await fetch(`/api/invoices/${invoice.id}/mark-paid`, { method: "POST" });
                        const j = (await res.json().catch(() => ({}))) as { error?: string };
                        if (!res.ok) throw new Error(j.error ?? "Failed to mark paid");
                        setStatus("paid");
                        toast.success("Invoice marked as paid.");
                        router.refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      } finally { setSaving(false); }
                    })()}
                    disabled={saving}
                    title="Mark this invoice as paid"
                  >
                    Paid
                  </Button>
                </>
              )}

              {/* ── PAID: Send Email + Void ── */}
              {status === "paid" && (
                <>
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
                        : "Send paid invoice receipt to client via email"
                    }
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Send Via Email
                  </Button>
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
                </>
              )}

              {/* ── Share button — visible for open, sent, paid, uncollectible ── */}
              {(status === "open" || status === "sent" || status === "paid" || status === "uncollectible") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void (async () => {
                    try {
                      const res = await fetch(`/api/invoices/${invoice.id}/share`, { method: "POST" });
                      const j = (await res.json().catch(() => ({}))) as { share_url?: string; error?: string };
                      if (!res.ok || !j.share_url) {
                        toast.error(j.error ?? "Failed to generate share link");
                        return;
                      }
                      await navigator.clipboard.writeText(j.share_url);
                      toast.success("Share link copied to clipboard!");
                    } catch {
                      toast.error("Failed to copy share link");
                    }
                  })()}
                  title="Copy a public shareable link for this invoice"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
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
