import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { Invoice, InvoiceStatus } from "@/lib/types/database";

function statusVariant(s: InvoiceStatus) {
  const map: Record<InvoiceStatus, "neutral" | "warning" | "success" | "danger"> = {
    draft: "neutral",
    sent: "warning",
    paid: "success",
    cancelled: "danger",
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

type InvoiceRow = Invoice & { projects: { name: string; client_name: string | null } | null };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const ti = t.invoices;

  const statusFilter =
    typeof searchParams.status === "string" && searchParams.status !== "all"
      ? searchParams.status
      : null;
  const search =
    typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const sort =
    typeof searchParams.sort === "string" && searchParams.sort === "updated"
      ? "updated"
      : "created";
  const sortField = sort === "updated" ? "updated_at" : "created_at";

  let query = supabase
    .from("invoices")
    .select("*, projects(name, client_name)")
    .eq("user_id", user.id)
    .order(sortField, { ascending: false });

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

  // Stats (all invoices regardless of filter)
  const all = (invoicesRaw ?? []) as InvoiceRow[];
  const draftCount = all.filter((i) => i.status === "draft").length;
  const sentCount = all.filter((i) => i.status === "sent").length;
  const paidCount = all.filter((i) => i.status === "paid").length;
  const cancelledCount = all.filter((i) => i.status === "cancelled").length;
  const totalRevenue = all
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);

  const statusLabels: Record<string, string> = {
    all: ti.all,
    draft: ti.draft,
    sent: ti.sent,
    paid: ti.paid,
    cancelled: ti.cancelled,
  };

  const statuses = ["all", "draft", "sent", "paid", "cancelled"] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title={ti.totalInvoices} value={String(all.length)} />
        <StatCard title={ti.draft} value={String(draftCount)} />
        <StatCard title={ti.sent} value={String(sentCount)} />
        <StatCard title={ti.paid} value={String(paidCount)} />
      </div>

      {/* Second stat row */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm text-slate-500">Cancelled</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {cancelledCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">{ti.totalRevenue}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {fmt(totalRevenue)}
          </div>
        </Card>
      </div>

      {/* Toolbar: status filter + sort + new invoice */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {statuses.map((s) => {
            const active =
              searchParams.status === s || (!searchParams.status && s === "all");
            const href =
              s === "all"
                ? `/dashboard/invoices${sort !== "created" ? `?sort=${sort}` : ""}`
                : `/dashboard/invoices?status=${s}${sort !== "created" ? `&sort=${sort}` : ""}`;
            return (
              <Link
                key={s}
                href={href}
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
        <div className="flex items-center gap-2">
          {/* Sort toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm dark:border-slate-700">
            <Link
              href={`/dashboard/invoices${statusFilter ? `?status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 font-medium transition-colors ${
                sort === "created"
                  ? "bg-primary text-white dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              By Created
            </Link>
            <Link
              href={`/dashboard/invoices?sort=updated${statusFilter ? `&status=${statusFilter}` : ""}`}
              className={`px-3 py-1.5 font-medium border-l border-slate-200 transition-colors dark:border-slate-700 ${
                sort === "updated"
                  ? "bg-primary text-white dark:bg-slate-700 dark:text-white"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              By Updated
            </Link>
          </div>
          <Link href="/dashboard/invoices/new">
            <Button size="sm">{ti.newInvoice}</Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <form method="GET">
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        {sort !== "created" && <input type="hidden" name="sort" value={sort} />}
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
                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pb-3 pr-4">{ti.invoiceNumber}</th>
                    <th className="pb-3 pr-4">{ti.project}</th>
                    <th className="pb-3 pr-4">{ti.client}</th>
                    <th className="pb-3 pr-4">{ti.status}</th>
                    <th className="pb-3 pr-4 text-right">{ti.total}</th>
                    <th className="pb-3 pr-4 text-right">Created</th>
                    <th className="pb-3 text-right">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {inv.invoice_number ?? inv.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                        {inv.project_id ? (
                          <Link
                            href={`/dashboard/projects/${inv.project_id}`}
                            className="hover:underline"
                          >
                            {inv.projects?.name ?? "—"}
                          </Link>
                        ) : (
                          inv.projects?.name ?? "—"
                        )}
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
