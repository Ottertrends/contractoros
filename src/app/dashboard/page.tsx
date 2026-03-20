import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectGrid } from "@/components/projects/project-grid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

export default async function DashboardHome() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: projects, error }, { data: invoicesRaw }] = await Promise.all([
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
      .limit(100),
  ]);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-red-600 font-medium">Failed to load projects.</div>
      </div>
    );
  }

  const allProjects = (projects ?? []) as Project[];
  const allInvoices = (invoicesRaw ?? []) as (Invoice & { projects: { name: string } | null })[];

  // Project stats
  const totalProjects = allProjects.length;
  const activeProjects = allProjects.filter((p) => p.status === "active").length;
  const totalQuoted = allProjects.reduce((acc, p) => {
    const n = p.quoted_amount ? Number(p.quoted_amount) : 0;
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  const lastQuoteDate = allProjects
    .map((p) => p.updated_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  // Invoice stats
  const totalInvoiced = allInvoices.reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const totalPaid = allInvoices
    .filter((i) => i.status === "paid")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);
  const outstanding = allInvoices
    .filter((i) => i.status === "sent")
    .reduce((acc, i) => acc + (parseFloat(i.total) || 0), 0);

  const recentInvoices = allInvoices.slice(0, 5);
  const featured = allProjects.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      {/* Project stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Projects" value={`${totalProjects}`} />
        <StatCard title="Active Projects" value={`${activeProjects}`} />
        <StatCard title="Total Quoted" value={fmt(totalQuoted)} />
        <StatCard
          title="Last Quote Date"
          value={lastQuoteDate ? new Date(lastQuoteDate).toLocaleDateString() : "—"}
        />
      </div>

      {/* Invoice stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Invoiced" value={fmt(totalInvoiced)} />
        <StatCard title="Total Paid" value={fmt(totalPaid)} />
        <StatCard title="Outstanding" value={fmt(outstanding)} />
      </div>

      {/* Projects section */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">Your Projects</div>
          <div className="text-sm text-slate-500">Manage quotes, notes, and current work.</div>
        </div>
        <Link href="/dashboard/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>

      {allProjects.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectGrid projects={featured} />
      )}

      <div>
        <Link href="/dashboard/projects" className="text-sm font-medium text-primary hover:underline">
          View all projects
        </Link>
      </div>

      {/* Recent Invoices */}
      {recentInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Recent Invoices</CardTitle>
              <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pb-2 pr-4">Invoice #</th>
                    <th className="pb-2 pr-4">Project</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-mono text-primary hover:underline text-xs"
                        >
                          {inv.invoice_number ?? inv.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {inv.projects?.name ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                      </td>
                      <td className="py-2 text-right font-mono text-slate-800">
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
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
      <div className="text-slate-900 font-semibold">No projects yet</div>
      <div className="mt-2 text-sm text-slate-600">Create your first project to get started.</div>
      <div className="mt-5">
        <Link href="/dashboard/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>
    </div>
  );
}
