import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Invoices no longer have a standalone edit page.
 * Redirect to the parent project, which already contains the invoice editor.
 */
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("project_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (invoice?.project_id) {
    redirect(`/dashboard/projects/${invoice.project_id}?invoiceId=${id}`);
  }

  // Fallback — invoice has no project or wasn't found
  redirect("/dashboard/invoices");
}
