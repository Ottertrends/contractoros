import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markPaidStripeInvoice } from "@/lib/invoice/sync-stripe";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await markPaidStripeInvoice(id, user.id);
    await supabase
      .from("invoices")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark invoice as paid";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
