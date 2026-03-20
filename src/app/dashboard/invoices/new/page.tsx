import Link from "next/link";

import { InvoiceFormClient } from "@/components/invoices/invoice-form-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { PriceBookItem, Project } from "@/lib/types/database";

async function getNextInvoiceNumber(userId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  const n = (count ?? 0) + 1;
  return `INV-${String(n).padStart(3, "0")}`;
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const ti = t.invoices;

  const defaultProjectId =
    typeof searchParams.projectId === "string" ? searchParams.projectId : undefined;

  const [{ data: projectsRaw }, { data: priceBookRaw }, nextNumber] = await Promise.all([
    supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
    supabase.from("price_book").select("*").eq("user_id", user.id).order("item_name"),
    getNextInvoiceNumber(user.id),
  ]);

  const projects = (projectsRaw ?? []) as Project[];
  const priceBook = (priceBookRaw ?? []) as PriceBookItem[];

  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
          {ti.backToInvoices}
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="text-slate-900 dark:text-slate-50 font-semibold">{t.dashboard.noProjects}</div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {ti.noProjectsYet}
          </div>
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
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
        {ti.backToInvoices}
      </Link>
      <InvoiceFormClient
        mode="create"
        userId={user.id}
        projects={projects}
        priceBook={priceBook}
        nextInvoiceNumber={nextNumber}
        defaultProjectId={defaultProjectId}
      />
    </div>
  );
}
