import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Invoice, Project } from "@/lib/types/database";
import { ProjectForm } from "@/components/projects/project-form";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const projectId = params.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (projectError || !project) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-slate-900 font-semibold">Project not found</div>
      </div>
    );
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const safeInvoices = (invoices ?? []) as Invoice[];
  const safeProject = project as Project;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/dashboard/projects" className="text-sm text-primary hover:underline">
          Back to Projects
        </Link>
        <div className="text-sm text-slate-500">
          Last updated:{" "}
          {safeProject.updated_at ? new Date(safeProject.updated_at).toLocaleDateString() : "—"}
        </div>
      </div>

      <ProjectForm mode="edit" userId={user.id} project={safeProject} />

      <Card>
        <CardHeader>
          <CardTitle>Related Invoices</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-600">
              Phase 3 will add invoice creation.
            </div>
            <Button disabled variant="secondary">
              Create Invoice (Phase 3)
            </Button>
          </div>

          {safeInvoices.length === 0 ? (
            <div className="text-sm text-slate-500">No invoices yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {safeInvoices.map((inv) => (
                    <tr key={inv.id} className="text-slate-800 dark:text-slate-50">
                      <td className="py-3 pr-3">
                        {inv.invoice_number ?? inv.id}
                      </td>
                      <td className="py-3 pr-3">{inv.status}</td>
                      <td className="py-3">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: "USD",
                        }).format(Number(inv.total ?? 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

