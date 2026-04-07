import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { voidStripeInvoice } from "@/lib/invoice/sync-stripe";

/**
 * POST /api/invoices/[id]/cancel-stripe
 * Voids the associated Stripe invoice when a WorkSupp invoice is cancelled.
 * Silently succeeds if there is no Stripe invoice or it's already voided/paid.
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
    await voidStripeInvoice(id, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[cancel-stripe]", err);
    const message = err instanceof Error ? err.message : "Failed to void Stripe invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
