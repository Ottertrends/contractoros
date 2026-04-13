import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { Project } from "@/lib/types/database";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const ti = t.invoices;

  const sp = await searchParams;
  const projectId =
    typeof sp.projectId === "string" ? sp.projectId : undefined;

  // "Create new project" selected → go to new project page
  if (projectId === "__new__") {
    redirect("/dashboard/projects/new");
  }

  // Existing project selected → go straight to the project invoice editor
  if (projectId) {
    redirect(`/dashboard/projects/${projectId}`);
  }

  // No project selected yet — show picker
  const { data: projectsRaw } = await supabase
    .from("projects")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name");

  const projects = (projectsRaw ?? []) as Pick<Project, "id" | "name">[];

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
          {ti.backToInvoices}
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="text-slate-900 dark:text-slate-50 font-semibold">{t.dashboard.noProjects}</div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{ti.noProjectsYet}</div>
          <div className="mt-4">
            <Link
              href="/dashboard/projects/new"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t.projects.newProject}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
        {ti.backToInvoices}
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">New Invoice</h2>
          <p className="text-sm text-slate-500 mt-1">Select the project this invoice is for.</p>
        </div>

        {/* Native form — no JS required; submits as GET ?projectId=... */}
        <form method="get" action="/dashboard/invoices/new" className="space-y-4">
          <div>
            <label
              htmlFor="projectId"
              className="block text-xs font-medium text-slate-500 mb-1"
            >
              Project *
            </label>
            <select
              id="projectId"
              name="projectId"
              required
              defaultValue=""
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="" disabled>— Select a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? "Untitled"}
                </option>
              ))}
              <option value="__new__">+ Create new project</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors"
          >
            Continue →
          </button>
        </form>
      </div>
    </div>
  );
}
