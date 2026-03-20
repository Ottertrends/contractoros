import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftInvoiceCard } from "@/components/invoices/draft-invoice-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureDraftInvoice } from "@/lib/invoice/sync-draft";
import type { Invoice, InvoiceItem, InvoiceStatus, Project } from "@/lib/types/database";
import { ProjectForm } from "@/components/projects/project-form";

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

  const safeProject = project as Project;

  // Load all invoices for the project
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const safeInvoices = (invoices ?? []) as Invoice[];

  // Find or auto-create the draft invoice (app-layer fallback; DB trigger handles normal flow)
  let draftInvoice = safeInvoices.find((inv) => inv.status === "draft") ?? null;

  if (!draftInvoice) {
    const admin = createSupabaseAdminClient();
    const newId = await ensureDraftInvoice(admin, user.id, safeProject);
    if (newId) {
      const { data: fresh } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", newId)
        .single();
      if (fresh) draftInvoice = fresh as Invoice;
    }
  }

  // Load draft invoice items
  let draftItems: InvoiceItem[] = [];
  if (draftInvoice) {
    const { data: its } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", draftInvoice.id)
      .order("sort_order");
    draftItems = (its ?? []) as InvoiceItem[];
  }

  const nonDraftInvoices = safeInvoices.filter((inv) => inv.status !== "draft");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/dashboard/projects" className="text-sm text-primary hover:underline">
          ← Back to Projects
        </Link>
        <div className="text-sm text-slate-500">
          Last updated:{" "}
          {safeProject.updated_at
            ? new Date(safeProject.updated_at).toLocaleDateString()
            : "—"}
        </div>
      </div>

      {/* Project edit form */}
      <ProjectForm mode="edit" userId={user.id} project={safeProject} />

      {/* Draft Invoice — always visible, auto-created */}
      {draftInvoice ? (
        <DraftInvoiceCard
          projectName={safeProject.name}
          invoice={draftInvoice}
          items={draftItems}
        />
      ) : (
        <Card>
          <CardHeader><CardTitle>Draft Invoice</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              No draft invoice yet.{" "}
              <Link href={`/dashboard/invoices/new?projectId=${projectId}`} className="text-primary hover:underline">
                Create one manually
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sent / Paid / Cancelled invoices */}
      {nonDraftInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>Other Invoices</CardTitle>
              <Link href={`/dashboard/invoices/new?projectId=${projectId}`}>
                <Button variant="secondary" size="sm">New Invoice</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 pr-3">Invoice #</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {nonDraftInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                      <td className="py-3 pr-3">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {inv.invoice_number ?? inv.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {fmt(Number(inv.total ?? 0))}
                      </td>
                      <td className="py-3 text-right text-slate-400">
                        {inv.date
                          ? new Date(inv.date).toLocaleDateString("en-US")
                          : new Date(inv.created_at).toLocaleDateString("en-US")}
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
