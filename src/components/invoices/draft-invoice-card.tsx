"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, BookOpen, X } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import type { Invoice, InvoiceDesign, InvoiceItem, InvoiceStatus, PriceBookItem, Project } from "@/lib/types/database";
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
  () => import("./pdf-export-button").then((m) => ({ default: m.PdfExportButton })),
  { ssr: false, loading: () => <span className="text-xs text-slate-400">Loading PDF…</span> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemRow {
  _id: string;
  description: string; // single "Product / Service" field — what appears in PDF
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
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

function statusVariant(s: InvoiceStatus) {
  const map: Record<InvoiceStatus, "neutral" | "warning" | "success" | "danger"> = {
    draft: "neutral",
    sent: "warning",
    paid: "success",
    cancelled: "danger",
  };
  return map[s] ?? "neutral";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DraftInvoiceCard({ projectName, invoice, items, priceBook, project, userId }: Props) {
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

  // ── Line items ──
  const [rows, setRows] = React.useState<LineItemRow[]>(() =>
    items.length > 0
      ? items.map((it) => ({
          _id: it.id || crypto.randomUUID(),
          // backwards-compat: use description, fall back to name
          description: it.description || it.name || "",
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
        }))
      : [newRow(projectName)],
  );

  // ── UI state ──
  const [saving, setSaving] = React.useState(false);

  // Price book picker modal
  const [pbOpen, setPbOpen] = React.useState(false);
  const [pbSearch, setPbSearch] = React.useState("");

  // Profile + design settings (fetched once)
  const [profile, setProfile] = React.useState<{
    company_name: string | null;
    phone: string | null;
    email: string | null;
  } | null>(null);
  const [design, setDesign] = React.useState<InvoiceDesign>({
    logoUrl: null,
    primaryColor: "#111827",
    font: "helvetica",
    footer: null,
  });

  React.useEffect(() => {
    supabase
      .from("profiles")
      .select("company_name, phone, email, invoice_logo_url, invoice_primary_color, invoice_font, invoice_footer")
      .eq("id", userId)
      .single()
      .then(({ data }: { data: {
        company_name: string | null;
        phone: string | null;
        email: string | null;
        invoice_logo_url: string | null;
        invoice_primary_color: string | null;
        invoice_font: string | null;
        invoice_footer: string | null;
      } | null }) => {
        if (data) {
          setProfile({ company_name: data.company_name, phone: data.phone, email: data.email });
          setDesign({
            logoUrl: data.invoice_logo_url,
            primaryColor: data.invoice_primary_color ?? "#111827",
            font: (data.invoice_font as InvoiceDesign["font"]) ?? "helvetica",
            footer: data.invoice_footer,
          });
        }
      });
  }, [userId]);

  // ── Computed totals ──
  const subtotal = rows.reduce(
    (sum, r) => sum + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0),
    0,
  );
  const taxAmount = (subtotal * (parseFloat(taxRate) || 0)) / 100;
  const total = subtotal + taxAmount;

  // ── Line item helpers ──

  function updateRow(id: string, field: keyof Omit<LineItemRow, "_id">, value: string) {
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
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }

  // Select a price book item → fill description + unit price in one shot
  function selectPriceBookItem(rowId: string, item: PriceBookItem) {
    const label = item.unit ? `${item.item_name} (${item.unit})` : item.item_name;
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

  // Add item from price book modal
  function addFromPriceBook(item: PriceBookItem) {
    const price = String(parseFloat(item.unit_price) || 0);
    const label = item.unit ? `${item.item_name} (${item.unit})` : item.item_name;
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

  // ── Save ──

  async function handleSave(overrideStatus?: InvoiceStatus) {
    setSaving(true);
    try {
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (invErr) throw new Error(invErr.message);

      // Replace all line items
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

      if (overrideStatus) setStatus(overrideStatus);
      toast.success("Invoice saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
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
            {/* Modal header */}
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
                onClick={() => { setPbOpen(false); setPbSearch(""); }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <input
                autoFocus
                value={pbSearch}
                onChange={(e) => setPbSearch(e.target.value)}
                placeholder="Search items, categories…"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            {/* Item list */}
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
                          <span className="ml-1.5 text-xs text-slate-400">/ {item.unit}</span>
                        )}
                      </div>
                      {item.category && (
                        <div className="text-xs text-slate-400 mt-0.5">{item.category}</div>
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
                <span className="text-xs font-mono text-slate-500">{invoice.invoice_number}</span>
              )}
            </div>
            {/* Status selector inline */}
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
                <SelectTrigger className="h-8 text-xs w-36">
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
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {/* Date row */}
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
              <Label className="text-xs text-slate-500">{t.projects.projectName.replace(" *", "")}</Label>
              <div className="px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-sm border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                {projectName}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.projects.lineItems}
              </div>
              {priceBook.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPbOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Add from Price Book
                </button>
              )}
            </div>

            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[3fr_1fr_1.2fr_1fr_auto] gap-2 text-xs text-slate-400 px-1">
              <span>Product / Service</span>
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
                  <Label className="sm:hidden text-xs text-slate-400">Product / Service</Label>
                  <PriceBookLineInput
                    value={row.description}
                    onChange={(v) => updateRow(row._id, "description", v)}
                    onSelect={(item) => selectPriceBookItem(row._id, item)}
                    priceBook={priceBook}
                  />
                </div>
                <div>
                  <Label className="sm:hidden text-xs text-slate-400">{t.projects.qty}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(row._id, "quantity", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="sm:hidden text-xs text-slate-400">{t.projects.unitPrice}</Label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={row.unit_price}
                      onChange={(e) => updateRow(row._id, "unit_price", e.target.value)}
                      className="text-sm pl-5"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end sm:justify-start gap-2">
                  <Label className="sm:hidden text-xs text-slate-400 mr-1">{ti.lineTotal}</Label>
                  <span className="text-sm font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {fmt((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_price) || 0))}
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
            </div>
          </div>

          {/* Invoice Notes */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-slate-500">
              {t.projects.notes}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes visible on the invoice PDF…"
              rows={2}
            />
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
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
              />
              {status === "draft" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSave("sent")}
                  disabled={saving}
                >
                  {ti.markAsSent}
                </Button>
              )}
              {status === "sent" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSave("paid")}
                  disabled={saving}
                >
                  {ti.markAsPaid}
                </Button>
              )}
            </div>
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
