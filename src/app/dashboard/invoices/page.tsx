import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const statusFilter =
    typeof searchParams.status === "string" && searchParams.status !== "all"
      ? searchParams.status
      : null;
  const search =
    typeof searchParams.q === "string" ? searchParams.q.trim() : "";

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

  // Client-side filter for search (simple)
  if (search) {
    const lower = search.toLowerCase();
    invoices = invoices.filter(
      (inv) =>
        (inv.invoice_number ?? "").toLowerCase().includes(lower) ||
        (inv.projects?.name ?? "").toLowerCase().includes(lower) ||
        (inv.projects?.client_name ?? "").toLowerCase().includes(lower),
    );
  }

  // Stats
  const all = (invoicesRaw ?? []) as InvoiceRow[];
  const draftCount = all.filter((i) => i.status === "draft").length;
  const sentCount = all.filter((i) => i.status === "sent").length;
  const paidCount = all.filter((i) => i.status === "paid").length;
  const totalRevenue = all
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);

  const statuses = ["all", "draft", "sent", "paid", "cancelled"] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Invoices" value={String(all.length)} />
        <StatCard title="Draft" value={String(draftCount)} />
        <StatCard title="Sent" value={String(sentCount)} />
        <StatCard title="Paid" value={String(paidCount)} />
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-wrap">
          <span className="text-xl font-semibold text-slate-900">Total Revenue</span>
          <span className="text-2xl font-bold text-slate-900">{fmt(totalRevenue)}</span>
        </div>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {statuses.map((s) => {
            const active = (searchParams.status === s) || (!searchParams.status && s === "all");
            return (
              <Link
                key={s}
                href={s === "all" ? "/dashboard/invoices" : `/dashboard/invoices?status=${s}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Link>
            );
          })}
        </div>
        <Link href="/dashboard/invoices/new">
          <Button>New Invoice</Button>
        </Link>
      </div>

      {/* Search */}
      <form method="GET">
        {statusFilter && (
          <input type="hidden" name="status" value={statusFilter} />
        )}
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder="Search invoices, projects, clients…"
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button type="submit" variant="secondary" className="shrink-0">Search</Button>
        </div>
      </form>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {search || statusFilter ? "No invoices match your filters." : "No invoices yet."}
              {!search && !statusFilter && (
                <div className="mt-4">
                  <Link href="/dashboard/invoices/new">
                    <Button>Create your first invoice</Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pb-3 pr-4">Invoice #</th>
                    <th className="pb-3 pr-4">Project</th>
                    <th className="pb-3 pr-4">Client</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4 text-right">Total</th>
                    <th className="pb-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {inv.invoice_number ?? inv.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {inv.projects?.name ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-500">
                        {inv.projects?.client_name ?? "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusVariant(inv.status)}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-slate-800">
                        {fmt(parseFloat(inv.total) || 0)}
                      </td>
                      <td className="py-3 text-right text-slate-400">
                        {new Date(inv.created_at).toLocaleDateString("en-US")}
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
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </Card>
  );
}
