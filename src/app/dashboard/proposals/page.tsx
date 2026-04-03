import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProposalsClient } from "@/components/proposals/proposals-client";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirected=true");

  const [projectsResult, templatesResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, client_name, status")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("proposal_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
  ]);

  const projects = projectsResult.error ? [] : (projectsResult.data ?? []);
  const templates = templatesResult.error ? [] : (templatesResult.data ?? []);
  if (templatesResult.error && process.env.NODE_ENV === "development") {
    console.warn(
      "[proposals] proposal_templates:",
      templatesResult.error.message,
      "— apply migration 016_proposals.sql if this table is new.",
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Proposals</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Generate professional PDF proposals and quotes from your project data.
        </p>
      </div>
      <ProposalsClient projects={projects} initialTemplates={templates} />
    </div>
  );
}
