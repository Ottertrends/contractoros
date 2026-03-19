import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectGrid } from "@/components/projects/project-grid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types/database";
import Link from "next/link";

export default async function DashboardHome() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    // In Phase 1, keep UI simple; middleware ensures auth.
    return (
      <div className="p-4 md:p-6">
        <div className="text-red-600 font-medium">
          Failed to load projects.
        </div>
      </div>
    );
  }

  const allProjects = (projects ?? []) as Project[];

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

  const featured = allProjects.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Projects" value={`${totalProjects}`} />
        <StatCard title="Active Projects" value={`${activeProjects}`} />
        <StatCard
          title="Total Quoted"
          value={
            new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: "USD",
            }).format(totalQuoted)
          }
        />
        <StatCard
          title="Last Quote Date"
          value={
            lastQuoteDate ? new Date(lastQuoteDate).toLocaleDateString() : "—"
          }
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-900">
            Your Projects
          </div>
          <div className="text-sm text-slate-500">
            Manage quotes, notes, and current work.
          </div>
        </div>
        <Link href="/dashboard/projects/new">
          <Button>
            New Project
          </Button>
        </Link>
      </div>

      {allProjects.length === 0 ? (
        <EmptyState />
      ) : (
        <ProjectGrid projects={featured} />
      )}

      <div>
        <Link
          href="/dashboard/projects"
          className="text-sm font-medium text-primary hover:underline"
        >
          View all projects
        </Link>
      </div>
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
      <div className="mt-2 text-sm text-slate-600">
        Create your first project to get started.
      </div>
      <div className="mt-5">
        <Link href="/dashboard/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>
    </div>
  );
}

