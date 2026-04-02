import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createInvoicePaymentLink } from "@/lib/stripe-connect";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: invoiceId } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", user.id)
      .single();

    const connectId = profile?.stripe_connect_account_id as string | null;
    if (!connectId) {
      return NextResponse.json({ error: "Connect Stripe in Settings first" }, { status: 400 });
    }
    if (!profile?.stripe_connect_charges_enabled) {
      return NextResponse.json(
        { error: "Complete Stripe onboarding before creating payment links" },
        { status: 400 },
      );
    }

    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("id, invoice_number, total, status, user_id, stripe_payment_link_url, pay_with_ach_enabled")
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (invErr || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (inv.status !== "sent") {
      return NextResponse.json({ error: "Set invoice status to Sent before generating a payment link" }, { status: 400 });
    }

    if (inv.stripe_payment_link_url) {
      return NextResponse.json({
        url: inv.stripe_payment_link_url as string,
        existing: true,
      });
    }

    const total = parseFloat(inv.total as string);
    const { url: paymentUrl, id: linkId } = await createInvoicePaymentLink({
      connectedAccountId: connectId,
      invoiceId: inv.id as string,
      userId: user.id,
      invoiceNumber: (inv.invoice_number as string) ?? inv.id.slice(0, 8),
      totalAmount: total,
      includeAch: !!inv.pay_with_ach_enabled,
    });

    await admin
      .from("invoices")
      .update({
        stripe_payment_link_url: paymentUrl,
        stripe_payment_link_id: linkId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    return NextResponse.json({ url: paymentUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create payment link";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
