import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectGrid } from "@/components/projects/project-grid";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types/database";

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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const pageSize = 9;
  const from = (page - 1) * pageSize;
  const to = from + pageSize; // request one extra for "hasNext"

  let query = supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
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
      .order("updated_at", { ascending: false })
      .range(from, to);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: rows, error } = await query;
  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-600 font-medium">
          Failed to load projects.
        </div>
      </div>
    );
  }

  const all = (rows ?? []) as Project[];
  const projects = all.slice(0, pageSize);
  const hasNext = all.length > pageSize;

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status !== "all") params.set("status", status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              Projects
            </div>
            <div className="text-sm text-slate-500">
              Search, filter, and manage your project quotes.
            </div>
          </div>

          <Link href="/dashboard/projects/new">
            <Button>New Project</Button>
          </Link>
        </div>

        <ProjectsToolbar
          initialQuery={q}
          initialStatus={status}
        />
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectGrid projects={projects} />
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
            Prev
          </Link>
          <div className="text-sm text-slate-500">Page {page}</div>
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
            Next
          </Link>
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
      <div className="text-slate-900 font-semibold">No projects found</div>
      <div className="mt-2 text-sm text-slate-600">
        Adjust your search/filter or create your first project.
      </div>
    </div>
  );
}

