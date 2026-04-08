"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/types/database";

function statusVariant(s: InvoiceStatus) {
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

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

interface InvoiceRowData {
  id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  total: string;
  created_at: string | null;
  updated_at: string | null;
  project_id: string | null;
  projects: { name: string; client_name: string | null } | null;
}

export function InvoiceTableRows({ invoices }: { invoices: InvoiceRowData[] }) {
  const router = useRouter();

  return (
    <>
      {invoices.map((inv) => (
        <tr
          key={inv.id}
          onClick={() => {
            if (inv.project_id) {
              router.push(`/dashboard/projects/${inv.project_id}`);
            }
          }}
          className="hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors"
        >
          <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-400">
            {inv.invoice_number ?? inv.id.slice(0, 8)}
          </td>
          <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
            {inv.projects?.name ?? "—"}
          </td>
          <td className="py-3 pr-4 text-slate-500">
            {inv.projects?.client_name ?? "—"}
          </td>
          <td className="py-3 pr-4">
            <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
          </td>
          <td className="py-3 pr-4 text-right font-mono text-slate-800 dark:text-slate-200">
            {fmt(parseFloat(inv.total) || 0)}
          </td>
          <td className="py-3 pr-4 text-right text-slate-400 text-xs">
            {fmtDate(inv.created_at)}
          </td>
          <td className="py-3 text-right text-slate-400 text-xs">
            {fmtDate(inv.updated_at)}
          </td>
        </tr>
      ))}
    </>
  );
}
