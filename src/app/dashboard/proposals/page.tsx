import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { canUseProposals } from "@/lib/billing/access";
import { ProposalsClient } from "@/components/proposals/proposals-client";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirected=true");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, subscription_status, subscription_seats")
    .eq("id", user.id)
    .single();

  // Gate behind Premium
  if (!canUseProposals(profile ?? {})) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Proposals</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Generate professional PDF proposals and quotes from your project data.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-5 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800">
            <Lock className="h-7 w-7 text-slate-400" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
              Upgrade to Create Proposals
            </h2>
            <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
              AI-generated PDF proposals are available on the Premium plan. Upgrade to create
              professional quotes for your clients.
            </p>
          </div>
          <a
            href="/dashboard/billing"
            className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Upgrade to Premium →
          </a>
        </div>
      </div>
    );
  }

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
