import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markUncollectibleStripeInvoice } from "@/lib/invoice/sync-stripe";

/**
 * POST /api/invoices/[id]/uncollectible
 * Marks an open invoice as uncollectible in both Stripe and WorkSupp.
 * Stripe step is silently skipped if no Stripe invoice exists.
 * Returns { success: true }.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verify invoice belongs to user
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Mark uncollectible in Stripe (silently ignores if no Stripe invoice)
    await markUncollectibleStripeInvoice(id, user.id);

    // Update WorkSupp status
    await supabase
      .from("invoices")
      .update({
        status: "uncollectible",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[uncollectible]", err);
    const message =
      err instanceof Error ? err.message : "Failed to mark as uncollectible";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
