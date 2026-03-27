import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableHeader } from "@/components/ui/sortable-header";
import { ProjectTableRows } from "@/components/projects/project-table-rows";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { InvoiceStatus, Project } from "@/lib/types/database";

function sortProjects(
  projects: Project[],
  invoiceTotalMap: Record<string, string>,
  sortBy: string,
  sortDir: "asc" | "desc",
): Project[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortBy === "name") { av = a.name ?? ""; bv = b.name ?? ""; }
    else if (sortBy === "client") { av = a.client_name ?? ""; bv = b.client_name ?? ""; }
    else if (sortBy === "location") {
      av = [a.city, a.state].filter(Boolean).join(", ") || (a.location ?? "");
      bv = [b.city, b.state].filter(Boolean).join(", ") || (b.location ?? "");
    }
    else if (sortBy === "status") { av = a.status ?? ""; bv = b.status ?? ""; }
    else if (sortBy === "invoice") {
      av = parseFloat(invoiceTotalMap[a.id] ?? "0") || 0;
      bv = parseFloat(invoiceTotalMap[b.id] ?? "0") || 0;
    }
    else if (sortBy === "created") { av = a.created_at ?? ""; bv = b.created_at ?? ""; }
    else { av = a.updated_at ?? ""; bv = b.updated_at ?? ""; }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = typeof searchParams?.q === "string" ? searchParams.q : "";
  const status = typeof searchParams?.status === "string" ? searchParams.status : "all";
  const sortBy = typeof searchParams?.sortBy === "string" ? searchParams.sortBy : "updated";
  const sortDir: "asc" | "desc" = searchParams?.sortDir === "asc" ? "asc" : "desc";
  const page =
    typeof searchParams?.page === "string"
      ? Math.max(1, parseInt(searchParams.page, 10) || 1)
      : 1;
  const pageSize = 20;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const tp = t.projects;

  // Fetch all matching projects (no DB pagination — sort in JS)
  let query = supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (q.trim()) {
    const pattern = `%${q.trim()}%`;
    query = supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .or(
        `name.ilike.${pattern},client_name.ilike.${pattern},location.ilike.${pattern},notes.ilike.${pattern}`,
      )
      .order("updated_at", { ascending: false })
      .limit(500);
  }
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: rows, error } = await query;
  if (error) {
    return (
      <div className="p-4 text-red-600 font-medium">{t.dashboard.failedToLoad}</div>
    );
  }

  const allProjects = (rows ?? []) as Project[];

  // Fetch invoice totals for all project IDs
  const projectIds = allProjects.map((p) => p.id);
  const invoiceStatusMap: Record<string, InvoiceStatus> = {};
  const invoiceTotalMap: Record<string, string> = {};
  if (projectIds.length > 0) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("project_id, status, total")
      .in("project_id", projectIds)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    for (const inv of invs ?? []) {
      if (!invoiceStatusMap[inv.project_id]) {
        invoiceStatusMap[inv.project_id] = inv.status as InvoiceStatus;
        invoiceTotalMap[inv.project_id] = inv.total ?? "0";
      }
    }
  }

  // Sort and paginate in JS
  const sorted = sortProjects(allProjects, invoiceTotalMap, sortBy, sortDir);
  const from = (page - 1) * pageSize;
  const projects = sorted.slice(from, from + pageSize);
  const hasNext = sorted.length > from + pageSize;

  // Build href for sortable headers (preserves q, status)
  function buildSortHref(field: string, dir: "asc" | "desc") {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status !== "all") p.set("status", status);
    p.set("sortBy", field);
    p.set("sortDir", dir);
    return `/dashboard/projects?${p.toString()}`;
  }

  // Pagination href
  function pageHref(pg: number) {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status !== "all") p.set("status", status);
    p.set("sortBy", sortBy);
    p.set("sortDir", sortDir);
    if (pg > 1) p.set("page", String(pg));
    return `/dashboard/projects?${p.toString()}`;
  }

  const statuses = ["all", "active", "completed", "on_hold", "cancelled"] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {tp.title}
          </div>
          <div className="text-sm text-slate-500">{tp.subtitle}</div>
        </div>
        <Link href="/dashboard/projects/new">
          <Button>{tp.newProject}</Button>
        </Link>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {statuses.map((s) => {
          const active = status === s || (!searchParams?.status && s === "all");
          const p2 = new URLSearchParams();
          if (q.trim()) p2.set("q", q.trim());
          if (s !== "all") p2.set("status", s);
          p2.set("sortBy", sortBy);
          p2.set("sortDir", sortDir);
          return (
            <Link
              key={s}
              href={`/dashboard/projects?${p2.toString()}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                active
                  ? "bg-primary text-white dark:bg-slate-700 dark:text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </Link>
          );
        })}
      </div>

      {/* Search */}
      <ProjectsToolbar initialQuery={q} initialStatus={status} />

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {allProjects.length} project{allProjects.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {tp.noProjects}
              <div className="mt-1 text-xs">{tp.adjustFilter}</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <SortableHeader label="Project" field="name" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label="Client" field="client" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label="Location" field="location" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} />
                    <SortableHeader label="Invoice" field="invoice" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} right />
                    <SortableHeader label="Updated" field="updated" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} right />
                    <SortableHeader label="Created" field="created" sortBy={sortBy} sortDir={sortDir} buildHref={buildSortHref} right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <ProjectTableRows projects={projects} invoiceTotalMap={invoiceTotalMap} />
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={page > 1 ? pageHref(page - 1) : "#"}
            className={`text-sm font-medium ${
              page > 1 ? "text-primary hover:underline" : "text-slate-400 pointer-events-none"
            }`}
          >
            {tp.prev}
          </Link>
          <div className="text-sm text-slate-500">
            Page {page} · {allProjects.length} total
          </div>
          <Link
            href={hasNext ? pageHref(page + 1) : "#"}
            className={`text-sm font-medium ${
              hasNext ? "text-primary hover:underline" : "text-slate-400 pointer-events-none"
            }`}
          >
            {tp.next}
          </Link>
        </div>
      </Card>
    </div>
  );
}
