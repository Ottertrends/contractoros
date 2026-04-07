import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncToStripe } from "@/lib/invoice/sync-stripe";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncToStripe(invoiceId, user.id);
    return NextResponse.json({ hosted_url: result.hosted_url, stripe_invoice_id: result.stripe_invoice_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sync-stripe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
