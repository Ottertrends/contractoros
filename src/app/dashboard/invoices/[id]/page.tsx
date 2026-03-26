import Link from "next/link";

import { InvoiceFormClient } from "@/components/invoices/invoice-form-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerLang } from "@/lib/i18n/server";
import { getT } from "@/lib/i18n/translations";
import type { Invoice, InvoiceItem, PriceBookItem, Project } from "@/lib/types/database";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const lang = await getServerLang();
  const t = getT(lang);
  const ti = t.invoices;

  const { id } = await params;

  const [
    { data: invoiceRaw, error: invErr },
    { data: itemsRaw },
    { data: projectsRaw },
    { data: priceBookRaw },
  ] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", id).eq("user_id", user.id).single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("projects").select("*").eq("user_id", user.id).order("name"),
    supabase.from("price_book").select("*").eq("user_id", user.id).order("item_name"),
  ]);

  if (invErr || !invoiceRaw) {
    return (
      <div className="p-4">
        <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
          {ti.backToInvoices}
        </Link>
        <div className="mt-4 text-slate-900 dark:text-slate-50 font-semibold">{t.common.noResults}</div>
      </div>
    );
  }

  const invoice = invoiceRaw as Invoice;
  const items = (itemsRaw ?? []) as InvoiceItem[];
  const projects = (projectsRaw ?? []) as Project[];
  const priceBook = (priceBookRaw ?? []) as PriceBookItem[];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/invoices" className="text-sm text-primary hover:underline">
        {ti.backToInvoices}
      </Link>
      <InvoiceFormClient
        mode="edit"
        userId={user.id}
        projects={projects}
        priceBook={priceBook}
        nextInvoiceNumber={invoice.invoice_number ?? ""}
        invoice={invoice}
        existingItems={items}
      />
    </div>
  );
}
