import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableHeader } from "@/components/ui/sortable-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { Invoice, InvoiceStatus } from "@/lib/types/database";
import { InvoiceTableRows } from "@/components/invoices/invoice-table-rows";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type InvoiceRow = Invoice & { projects: { name: string; client_name: string | null } | null };

function sortInvoices(
  invoices: InvoiceRow[],
  sortBy: string,
  sortDir: "asc" | "desc",
): InvoiceRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...invoices].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortBy === "invoice_number") { av = a.invoice_number ?? ""; bv = b.invoice_number ?? ""; }
    else if (sortBy === "project") { av = a.projects?.name ?? ""; bv = b.projects?.name ?? ""; }
    else if (sortBy === "client") { av = a.projects?.client_name ?? ""; bv = b.projects?.client_name ?? ""; }
    else if (sortBy === "status") { av = a.status ?? ""; bv = b.status ?? ""; }
    else if (sortBy === "total") {
      av = parseFloat(a.total) || 0;
      bv = parseFloat(b.total) || 0;
    }
    else if (sortBy === "updated") { av = a.updated_at ?? ""; bv = b.updated_at ?? ""; }
    else { av = a.created_at ?? ""; bv = b.created_at ?? ""; } // default: created
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const ti = t.invoices;

  const sp = searchParams ? await searchParams : {};
  const statusFilter =
    typeof sp.status === "string" && sp.status !== "all"
      ? sp.status
      : null;
  const search =
    typeof sp.q === "string" ? sp.q.trim() : "";
  const sortBy =
    typeof sp.sortBy === "string" ? sp.sortBy : "created";
  const sortDir: "asc" | "desc" =
    sp.sortDir === "asc" ? "asc" : "desc";

  let query = supabase
    .from("invoices")
    .select("*, projects(name, client_name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: invoicesRaw } = await query;
  let invoices = (invoicesRaw ?? []) as InvoiceRow[];

  if (search) {
    const lower = search.toLowerCase();
    invoices = invoices.filter(
      (inv) =>
        (inv.invoice_number ?? "").toLowerCase().includes(lower) ||
        (inv.projects?.name ?? "").toLowerCase().includes(lower) ||
        (inv.projects?.client_name ?? "").toLowerCase().includes(lower),
    );
  }

  // Sort in JS
  invoices = sortInvoices(invoices, sortBy, sortDir);

  // Stats (all invoices regardless of filter)
  const all = (invoicesRaw ?? []) as InvoiceRow[];
  const draftCount = all.filter((i) => i.status === "draft").length;
  const sentCount = all.filter((i) => i.status === "sent").length;
  const paidCount = all.filter((i) => i.status === "paid").length;
  const totalRevenue = all
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const totalInvoiced = all
    .filter((i) => i.status === "draft" || i.status === "sent")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const totalPaid = totalRevenue;
  const outstanding = totalInvoiced - totalPaid;

  const statusLabels: Record<string, string> = {
    all: ti.all,
    draft: ti.draft,
    sent: ti.sent,
    paid: ti.paid,
    cancelled: ti.cancelled,
  };

  const statuses = ["all", "draft", "sent", "paid", "cancelled"] as const;

  // Build href for sortable headers (preserves status and q)
  function buildSortHref(field: string, dir: "asc" | "desc") {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (statusFilter) p.set("status", statusFilter);
    p.set("sortBy", field);
    p.set("sortDir", dir);
    return `/dashboard/invoices?${p.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Invoices" value={String(all.length)} />
        <StatCard title="Draft" value={String(draftCount)} />
        <StatCard title="Sent" value={String(sentCount)} />
        <StatCard title="Paid" value={String(paidCount)} />
      </div>
      {/* Row 2: financials */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Total Invoiced" value={fmt(totalInvoiced)} />
        <StatCard title="Total Paid" value={fmt(totalPaid)} />
        <StatCard title="Outstanding" value={fmt(outstanding)} />
      </div>

      {/* Toolbar: status filter + new invoice */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {statuses.map((s) => {
            const active =
              statusFilter === s || (!statusFilter && s === "all");
            const p2 = new URLSearchParams();
            if (search) p2.set("q", search);
            if (s !== "all") p2.set("status", s);
            p2.set("sortBy", sortBy);
            p2.set("sortDir", sortDir);
            return (
              <Link
                key={s}
                href={`/dashboard/invoices?${p2.toString()}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-white dark:bg-slate-700 dark:text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {statusLabels[s]}
              </Link>
            );
          })}
        </div>
        <Link href="/dashboard/invoices/new">
          <Button size="sm">{ti.newInvoice}</Button>
        </Link>
      </div>

      {/* Search */}
      <form method="GET">
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <input type="hidden" name="sortBy" value={sortBy} />
        <input type="hidden" name="sortDir" value={sortDir} />
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder={ti.searchPlaceholder}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <Button type="submit" variant="secondary" className="shrink-0">
            {ti.search}
          </Button>
        </div>
      </form>

      {/* Invoice table */}
      <Card>
        <CardHeader>
          <CardTitle>{ti.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {search || statusFilter ? ti.noMatch : ti.noInvoices}
              {!search && !statusFilter && (
                <div className="mt-4">
                  <Link href="/dashboard/invoices/new">
                    <Button>{ti.createFirst}</Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <SortableHeader label={ti.invoiceNumber} field="invoice_number" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label={ti.project} field="project" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label={ti.client} field="client" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label={ti.status} field="status" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label={ti.total} field="total" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} right />
                    <SortableHeader label="Created" field="created" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} right />
                    <SortableHeader label="Last Updated" field="updated" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <InvoiceTableRows invoices={invoices} />
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</div>
    </Card>
  );
}
