import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InvoiceDesignClient } from "@/components/invoice-design/invoice-design-client";
import type { InvoiceDesign } from "@/lib/types/database";

export default async function InvoiceDesignPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, invoice_logo_url, invoice_primary_color, invoice_title_font, invoice_body_font, invoice_footer")
    .eq("id", user.id)
    .single();

  const design: InvoiceDesign = {
    logoUrl: profile?.invoice_logo_url ?? null,
    primaryColor: profile?.invoice_primary_color ?? "#111827",
    titleFont: (profile?.invoice_title_font as InvoiceDesign["titleFont"]) ?? "helvetica",
    bodyFont: (profile?.invoice_body_font as InvoiceDesign["bodyFont"]) ?? "helvetica",
    footer: profile?.invoice_footer ?? null,
  };

  return (
    <InvoiceDesignClient
      userId={user.id}
      companyName={profile?.company_name ?? ""}
      initialDesign={design}
    />
  );
}
