import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ invoices: [] });
  }

  const stripeInvoices = await getStripe().invoices.list({
    customer: profile.stripe_customer_id,
    limit: 24,
  });

  const invoices = stripeInvoices.data.map((inv) => ({
    id: inv.id,
    date: new Date((inv.created ?? 0) * 1000).toISOString(),
    amount: (inv.amount_paid ?? 0) / 100,
    status: inv.status ?? "unknown",
    pdf: inv.invoice_pdf ?? null,
    url: inv.hosted_invoice_url ?? null,
  }));

  return NextResponse.json({ invoices });
}
