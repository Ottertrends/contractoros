import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectTableRows } from "@/components/projects/project-table-rows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { Invoice, InvoiceStatus, Project } from "@/lib/types/database";

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

export default async function DashboardHome() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);

  const [{ data: projectsRaw, error }, { data: invoicesRaw }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("*, projects(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-red-600 font-medium">{t.dashboard.failedToLoad}</div>
      </div>
    );
  }

  const allProjects = (projectsRaw ?? []) as Project[];
  const allInvoices = (invoicesRaw ?? []) as (Invoice & { projects: { name: string } | null })[];

  const featured = allProjects.slice(0, 10);
  const featuredIds = new Set(featured.map((p) => p.id));

  const invoiceTotalMap: Record<string, string> = {};
  for (const inv of allInvoices) {
    if (inv.project_id && featuredIds.has(inv.project_id) && !invoiceTotalMap[inv.project_id]) {
      invoiceTotalMap[inv.project_id] = inv.total ?? "0";
    }
  }

  const totalInvoiced = allInvoices
    .filter((i) => i.status === "draft" || i.status === "sent")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const totalPaid = allInvoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const outstanding = totalInvoiced - totalPaid;

  const totalProjects = allProjects.length;
  const activeProjects = allProjects.filter((p) => p.status === "active").length;

  const linkedInvoices = allInvoices
    .filter((inv) => inv.project_id && featuredIds.has(inv.project_id))
    .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
    .slice(0, 10);

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: t.invoices.draft,
    open: "Open",
    sent: t.invoices.sent,
    paid: t.invoices.paid,
    void: "Void",
    uncollectible: "Uncollectible",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Financial stats — always 3 cols, compact on mobile */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard title={t.dashboard.totalInvoiced} value={fmt(totalInvoiced)} />
        <StatCard title={t.dashboard.totalPaid} value={fmt(totalPaid)} />
        <StatCard title={t.dashboard.outstanding} value={fmt(outstanding)} />
      </div>

      {/* Project counts */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard title={t.dashboard.totalProjects} value={`${totalProjects}`} />
        <StatCard title={t.dashboard.activeProjects} value={`${activeProjects}`} />
      </div>

      {/* Projects section header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t.dashboard.yourProjects}</div>
          <div className="text-sm text-slate-500">{t.dashboard.manageQuotes}</div>
        </div>
        <Link href="/dashboard/projects/new">
          <Button size="sm">{t.dashboard.newProject}</Button>
        </Link>
      </div>

      {allProjects.length === 0 ? (
        <EmptyState
          newProject={t.dashboard.newProject}
          noProjects={t.dashboard.noProjects}
          createFirst={t.dashboard.createFirst}
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="pb-3 pr-4 text-xs uppercase text-slate-400 font-medium">{t.dashboard.project}</th>
                    <th className="pb-3 pr-4 text-xs uppercase text-slate-400 font-medium">{t.dashboard.client}</th>
                    <th className="pb-3 pr-4 text-xs uppercase text-slate-400 font-medium">{t.dashboard.location}</th>
                    <th className="pb-3 pr-4 text-xs uppercase text-slate-400 font-medium">{t.dashboard.status}</th>
                    <th className="pb-3 pr-4 text-xs uppercase text-slate-400 font-medium text-right">{t.dashboard.invoice}</th>
                    <th className="pb-3 pr-4 text-xs uppercase text-slate-400 font-medium text-right">{t.dashboard.updated}</th>
                    <th className="pb-3 text-xs uppercase text-slate-400 font-medium text-right">{t.dashboard.created}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <ProjectTableRows projects={featured} invoiceTotalMap={invoiceTotalMap} />
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Link href="/dashboard/projects">
                <Button size="sm">{t.dashboard.viewAllProjects} →</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent invoices */}
      {linkedInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{t.dashboard.recentInvoices}</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t.dashboard.recentInvoicesDesc}
                </p>
              </div>
              <Link href="/dashboard/invoices">
                <Button size="sm">{t.dashboard.viewAll} →</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pb-2 pr-4">{t.dashboard.invoiceNumber}</th>
                    <th className="pb-2 pr-4">{t.dashboard.project}</th>
                    <th className="pb-2 pr-4">{t.dashboard.status}</th>
                    <th className="pb-2 pr-4">{t.dashboard.created}</th>
                    <th className="pb-2 pr-4">{t.dashboard.updated}</th>
                    <th className="pb-2 text-right">{t.dashboard.total}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linkedInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-mono text-primary hover:underline text-xs"
                        >
                          {inv.invoice_number ?? inv.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                        <Link
                          href={`/dashboard/projects/${inv.project_id}`}
                          className="hover:underline"
                        >
                          {inv.projects?.name ?? "—"}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariant(inv.status)}>{statusLabel[inv.status]}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-slate-400 text-xs">
                        {fmtDate(inv.created_at)}
                      </td>
                      <td className="py-2 pr-4 text-slate-400 text-xs">
                        {fmtDate(inv.updated_at)}
                      </td>
                      <td className="py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        {fmt(parseFloat(inv.total) || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="p-3 md:p-4">
      <div className="text-xs md:text-sm text-slate-500 leading-tight">{title}</div>
      <div className="mt-1 text-base md:text-2xl font-semibold text-slate-900 dark:text-slate-50 truncate">{value}</div>
    </Card>
  );
}

function EmptyState({
  newProject,
  noProjects,
  createFirst,
}: {
  newProject: string;
  noProjects: string;
  createFirst: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
      <div className="text-slate-900 dark:text-slate-50 font-semibold">{noProjects}</div>
      <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{createFirst}</div>
      <div className="mt-5">
        <Link href="/dashboard/projects/new">
          <Button>{newProject}</Button>
        </Link>
      </div>
    </div>
  );
}
