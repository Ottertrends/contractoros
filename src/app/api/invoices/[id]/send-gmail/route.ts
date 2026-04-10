import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildInvoicePdfBuffer } from "@/lib/invoice/server-pdf";
import { sendInvoiceViaGmail } from "@/lib/integrations/gmail-send";
import type { InvoiceDesign, Project } from "@/lib/types/database";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { to?: string; message?: string };
  if (!body.to?.trim()) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("*, projects(*)")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();

  if (invErr || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const [{ data: items }, { data: profile }, { data: savedTaxRates }] = await Promise.all([
    admin
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    admin.from("profiles").select("*").eq("id", user.id).single(),
    admin
      .from("tax_rates")
      .select("name, rate")
      .eq("user_id", user.id),
  ]);

  const design: InvoiceDesign = {
    logoUrl: profile?.invoice_logo_url ?? null,
    primaryColor: profile?.invoice_primary_color ?? "#111827",
    titleFont: (profile?.invoice_title_font as InvoiceDesign["titleFont"]) ?? "helvetica",
    bodyFont: (profile?.invoice_body_font as InvoiceDesign["bodyFont"]) ?? "helvetica",
    footer: profile?.invoice_footer ?? null,
  };

  const project = inv.projects as unknown as Project | null;
  const pdf = await buildInvoicePdfBuffer({
    invoice: {
      invoice_number: inv.invoice_number as string | null,
      status: inv.status as "draft" | "open" | "sent" | "paid" | "void" | "uncollectible",
      notes: inv.notes as string | null,
      subtotal: String(inv.subtotal),
      tax_rate: String(inv.tax_rate),
      tax_amount: String(inv.tax_amount),
      total: String(inv.total),
      created_at: inv.created_at as string,
    },
    project,
    profile: profile
      ? {
          company_name: profile.company_name,
          phone: profile.phone,
          email: profile.email,
        }
      : null,
    design,
    items: (items ?? []).map((it) => ({
      description: it.description as string,
      quantity: String(it.quantity),
      unit_price: String(it.unit_price),
      total: String(it.total),
      tax_rate: it.tax_rate != null ? String(it.tax_rate) : "0",
    })),
    savedTaxRates: (savedTaxRates ?? []).map((r) => ({ name: r.name as string, rate: String(r.rate) })),
    stripePaymentLinkUrl: (inv.stripe_payment_link_url as string | null) ?? null,
    stripeHostedUrl: (inv.stripe_hosted_url as string | null) ?? null,
    alternatePaymentInstructions: (inv.alternate_payment_instructions as string | null) ?? null,
  });

  const num = inv.invoice_number ?? invoiceId.slice(0, 8);
  const subject = `Invoice ${num} from ${profile?.company_name ?? "Contractor"}`;
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 560px;">
      <p>${(body.message ?? "Please find your invoice attached.").replace(/\n/g, "<br/>")}</p>
      <p style="color: #64748b; font-size: 14px;">Thank you for your business.</p>
    </div>
  `;

  await sendInvoiceViaGmail({
    userId: user.id,
    to: body.to.trim(),
    subject,
    htmlBody: html,
    pdfBuffer: pdf,
    filename: `invoice-${num}.pdf`,
  });

  return NextResponse.json({ ok: true });
}
