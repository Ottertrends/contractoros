"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import type { Invoice, InvoiceItem } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LineItemRow {
  id: string | null; // null = new unsaved row
  name: string;
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
  sort_order: number;
}

interface Props {
  projectName: string;
  invoice: Invoice;
  items: InvoiceItem[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function computeTotal(rows: LineItemRow[]): number {
  return rows.reduce((sum, r) => sum + Number(r.quantity) * Number(r.unit_price), 0);
}

export function DraftInvoiceCard({ projectName, invoice, items }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const tp = t.projects;
  const [saving, setSaving] = React.useState(false);
  const [date, setDate] = React.useState(invoice.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [rows, setRows] = React.useState<LineItemRow[]>(() =>
    items.length > 0
      ? items.map((it) => ({
          id: it.id,
          name: it.name ?? "",
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total: it.total,
          sort_order: it.sort_order,
        }))
      : [{ id: null, name: projectName, description: "", quantity: "1", unit_price: "0", total: "0", sort_order: 0 }],
  );

  const grandTotal = computeTotal(rows);

  function updateRow(idx: number, field: keyof LineItemRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value };
      // Auto-compute total when qty or unit_price changes
      if (field === "quantity" || field === "unit_price") {
        const qty = Number(field === "quantity" ? value : row.quantity) || 0;
        const price = Number(field === "unit_price" ? value : row.unit_price) || 0;
        row.total = String(qty * price);
      }
      next[idx] = row;
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: null, name: "", description: "", quantity: "1", unit_price: "0", total: "0", sort_order: prev.length },
    ]);
  }

  function removeRow(idx: number) {
    if (rows.length === 1) return; // keep at least one row
    setRows((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sort_order: i })));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const subtotal = grandTotal;

      // Update invoice header
      const { error: invErr } = await supabase
        .from("invoices")
        .update({
          date,
          subtotal: String(subtotal),
          total: String(subtotal),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (invErr) throw new Error(invErr.message);

      // Replace line items
      await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);

      const itemsPayload = rows.map((r, idx) => ({
        invoice_id: invoice.id,
        name: r.name || null,
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
        total: r.total,
        sort_order: idx,
      }));

      const { error: itemErr } = await supabase.from("invoice_items").insert(itemsPayload);
      if (itemErr) throw new Error(itemErr.message);

      toast.success("Draft invoice saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle>{tp.draftInvoice}</CardTitle>
            <Badge variant="neutral">{tp.draft}</Badge>
            <span className="text-xs font-mono text-slate-500">{invoice.invoice_number}</span>
          </div>
          <Link href={`/dashboard/invoices/${invoice.id}`}>
            <Button variant="secondary" size="sm">{tp.openFullInvoice}</Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Header row: project name + date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-slate-500">{tp.projectName.replace(" *","")}</Label>
            <div className="px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900 text-sm border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              {projectName}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="invoice-date" className="text-xs text-slate-500">{t.invoices.invoiceDate}</Label>
            <Input
              id="invoice-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Line items */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tp.lineItems}</div>

          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[2fr_3fr_1fr_1fr_1fr_auto] gap-2 text-xs text-slate-400 px-1">
            <span>{tp.productName}</span>
            <span>{tp.description}</span>
            <span>{tp.qty}</span>
            <span>{tp.unitPrice}</span>
            <span className="text-right">{t.invoices.lineTotal}</span>
            <span />
          </div>

          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[2fr_3fr_1fr_1fr_1fr_auto] gap-2 items-start"
            >
              <div>
                <Label className="sm:hidden text-xs text-slate-400">{tp.productName}</Label>
                <Input
                  placeholder={tp.productName}
                  value={row.name}
                  onChange={(e) => updateRow(idx, "name", e.target.value)}
                />
              </div>
              <div>
                <Label className="sm:hidden text-xs text-slate-400">{tp.description}</Label>
                <Input
                  placeholder={tp.description}
                  value={row.description}
                  onChange={(e) => updateRow(idx, "description", e.target.value)}
                />
              </div>
              <div>
                <Label className="sm:hidden text-xs text-slate-400">{tp.qty}</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  value={row.quantity}
                  onChange={(e) => updateRow(idx, "quantity", e.target.value)}
                />
              </div>
              <div>
                <Label className="sm:hidden text-xs text-slate-400">{tp.unitPrice}</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={row.unit_price}
                  onChange={(e) => updateRow(idx, "unit_price", e.target.value)}
                />
              </div>
              <div className="flex items-center sm:justify-end pt-0 sm:pt-2">
                <Label className="sm:hidden text-xs text-slate-400 mr-2">{t.invoices.lineTotal}</Label>
                <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
                  {fmt(Number(row.quantity) * Number(row.unit_price))}
                </span>
              </div>
              <div className="flex items-center sm:pt-2">
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  className="text-slate-400 hover:text-red-500 disabled:opacity-30 text-lg leading-none px-1"
                  title="Remove line"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="self-start text-xs text-primary hover:underline mt-1"
          >
            {tp.addLineItem}
          </button>
        </div>

        {/* Total + Save */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t.invoices.grandTotal}: <span className="font-mono text-lg">{fmt(grandTotal)}</span>
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? tp.saving2 : tp.saveDraft}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
