import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectGrid } from "@/components/projects/project-grid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { Invoice, InvoiceStatus, Project } from "@/lib/types/database";

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

export default async function DashboardHome({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);

  // Sort: 'created' = newest added first, default 'updated' = recently updated first
  const sort =
    typeof searchParams?.sort === "string" && searchParams.sort === "created"
      ? "created"
      : "updated";
  const sortField: "created_at" | "updated_at" =
    sort === "created" ? "created_at" : "updated_at";

  const [{ data: projectsRaw, error }, { data: invoicesRaw }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order(sortField, { ascending: false }),
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

  // Top 10 projects by chosen sort
  const featured = allProjects.slice(0, 10);
  const featuredIds = new Set(featured.map((p) => p.id));

  // Invoice status map for project cards
  const invoiceStatusMap: Record<string, InvoiceStatus> = {};
  for (const inv of allInvoices) {
    if (inv.project_id && featuredIds.has(inv.project_id) && !invoiceStatusMap[inv.project_id]) {
      invoiceStatusMap[inv.project_id] = inv.status;
    }
  }

  // Financial stats (all invoices)
  const totalInvoiced = allInvoices.reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const totalPaid = allInvoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const outstanding = allInvoices
    .filter((i) => i.status === "sent")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);

  const totalProjects = allProjects.length;
  const activeProjects = allProjects.filter((p) => p.status === "active").length;

  // Invoices for the featured 10 projects only, sorted by same criterion
  const linkedInvoices = allInvoices
    .filter((inv) => inv.project_id && featuredIds.has(inv.project_id))
    .sort((a, b) => {
      const aVal = sortField === "created_at" ? a.created_at : (a.updated_at ?? a.created_at);
      const bVal = sortField === "created_at" ? b.created_at : (b.updated_at ?? b.created_at);
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    })
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      {/* Financial stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t.dashboard.totalInvoiced} value={fmt(totalInvoiced)} />
        <StatCard title={t.dashboard.totalPaid} value={fmt(totalPaid)} />
        <StatCard title={t.dashboard.outstanding} value={fmt(outstanding)} />
      </div>

      {/* Project counts */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard title={t.dashboard.totalProjects} value={`${totalProjects}`} />
        <StatCard title={t.dashboard.activeProjects} value={`${activeProjects}`} />
      </div>

      {/* Projects section header + sort toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {t.dashboard.yourProjects}
          </div>
          <div className="text-sm text-slate-500">{t.dashboard.manageQuotes}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm dark:border-slate-700">
            <Link
              href="/dashboard"
              className={`px-3 py-1.5 font-medium transition-colors ${
                sort === "updated"
                  ? "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Recently Updated
            </Link>
            <Link
              href="/dashboard?sort=created"
              className={`px-3 py-1.5 font-medium border-l border-slate-200 transition-colors dark:border-slate-700 ${
                sort === "created"
                  ? "bg-primary text-white"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Recently Added
            </Link>
          </div>
          <Link href="/dashboard/projects/new">
            <Button size="sm">{t.dashboard.newProject}</Button>
          </Link>
        </div>
      </div>

      {allProjects.length === 0 ? (
        <EmptyState
          newProject={t.dashboard.newProject}
          noProjects={t.dashboard.noProjects}
          createFirst={t.dashboard.createFirst}
        />
      ) : (
        <ProjectGrid projects={featured} invoiceStatusMap={invoiceStatusMap} />
      )}

      <div>
        <Link href="/dashboard/projects" className="text-sm font-medium text-primary hover:underline">
          {t.dashboard.viewAllProjects}
        </Link>
      </div>

      {/* Recent invoices — linked to the same 10 projects above */}
      {linkedInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{t.dashboard.recentInvoices}</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {sort === "created" ? "Showing invoices for 10 newest projects" : "Showing invoices for 10 most recently updated projects"}
                </p>
              </div>
              <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
                {t.dashboard.viewAll}
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
                    <th className="pb-2 pr-4">Created</th>
                    <th className="pb-2 pr-4">Updated</th>
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
                        <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
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
    <Card className="p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</div>
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
