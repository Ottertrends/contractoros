import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectGrid } from "@/components/projects/project-grid";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { InvoiceStatus, Project } from "@/lib/types/database";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q =
    typeof searchParams?.q === "string" ? searchParams.q : "";
  const status =
    typeof searchParams?.status === "string" ? searchParams.status : "all";
  const page =
    typeof searchParams?.page === "string"
      ? Math.max(1, parseInt(searchParams.page, 10) || 1)
      : 1;
  const sort =
    typeof searchParams?.sort === "string" && searchParams.sort === "created"
      ? "created"
      : "updated";
  const sortField: "created_at" | "updated_at" =
    sort === "created" ? "created_at" : "updated_at";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const tp = t.projects;

  const pageSize = 9;
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  let query = supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order(sortField, { ascending: false })
    .range(from, to);

  if (q.trim().length > 0) {
    const pattern = `%${q.trim()}%`;
    query = supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .or(
        `name.ilike.${pattern},client_name.ilike.${pattern},location.ilike.${pattern},notes.ilike.${pattern}`,
      )
      .order(sortField, { ascending: false })
      .range(from, to);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: rows, error } = await query;
  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-600 font-medium">{t.dashboard.failedToLoad}</div>
      </div>
    );
  }

  const all = (rows ?? []) as Project[];
  const projects = all.slice(0, pageSize);
  const hasNext = all.length > pageSize;

  const projectIds = projects.map((p) => p.id);
  const invoiceStatusMap: Record<string, InvoiceStatus> = {};
  if (projectIds.length > 0) {
    const { data: invoicesForPage } = await supabase
      .from("invoices")
      .select("project_id, status")
      .in("project_id", projectIds)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    for (const inv of invoicesForPage ?? []) {
      if (!invoiceStatusMap[inv.project_id]) {
        invoiceStatusMap[inv.project_id] = inv.status as InvoiceStatus;
      }
    }
  }

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status !== "all") params.set("status", status);
  if (sort !== "updated") params.set("sort", sort);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {tp.title}
            </div>
            <div className="text-sm text-slate-500">{tp.subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sort toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm dark:border-slate-700">
              <Link
                href={`/dashboard/projects?${new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }).toString()}`}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  sort === "updated"
                    ? "bg-primary text-white dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Recently Updated
              </Link>
              <Link
                href={`/dashboard/projects?${new URLSearchParams({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}), sort: "created" }).toString()}`}
                className={`px-3 py-1.5 font-medium border-l border-slate-200 transition-colors dark:border-slate-700 ${
                  sort === "created"
                    ? "bg-primary text-white dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Recently Added
              </Link>
            </div>
            <Link href="/dashboard/projects/new">
              <Button>{tp.newProject}</Button>
            </Link>
          </div>
        </div>

        <ProjectsToolbar initialQuery={q} initialStatus={status} />
      </div>

      {projects.length === 0 ? (
        <EmptyState noProjects={tp.noProjects} adjustFilter={tp.adjustFilter} />
      ) : (
        <ProjectGrid projects={projects} invoiceStatusMap={invoiceStatusMap} />
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <Link
            href={
              page > 1
                ? `/dashboard/projects?${new URLSearchParams({
                    ...Object.fromEntries(params.entries()),
                    page: String(page - 1),
                  }).toString()}`
                : "#"
            }
            className={`text-sm font-medium ${
              page > 1 ? "text-primary hover:underline" : "text-slate-400 pointer-events-none"
            }`}
          >
            {tp.prev}
          </Link>
          <div className="text-sm text-slate-500">
            {tp.page} {page}
          </div>
          <Link
            href={
              hasNext
                ? `/dashboard/projects?${new URLSearchParams({
                    ...Object.fromEntries(params.entries()),
                    page: String(page + 1),
                  }).toString()}`
                : "#"
            }
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

function EmptyState({ noProjects, adjustFilter }: { noProjects: string; adjustFilter: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
      <div className="text-slate-900 dark:text-slate-50 font-semibold">{noProjects}</div>
      <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{adjustFilter}</div>
    </div>
  );
}
