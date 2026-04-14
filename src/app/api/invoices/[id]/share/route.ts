import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateShareToken } from "@/lib/utils/token";

const SHAREABLE_STATUSES = ["open", "sent", "paid", "uncollectible"];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, status, share_token, user_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    if (!SHAREABLE_STATUSES.includes(invoice.status)) {
      return NextResponse.json(
        { error: `Invoice must be finalized before sharing. Current status: ${invoice.status}` },
        { status: 400 },
      );
    }

    // Return existing token if already generated
    if (invoice.share_token) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://worksup.vercel.app").replace(/\/$/, "");
      return NextResponse.json({ share_url: `${appUrl}/invoice/${invoice.share_token}` });
    }

    const token = generateShareToken();
    const { error } = await supabase
      .from("invoices")
      .update({ share_token: token, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://worksup.vercel.app").replace(/\/$/, "");
    return NextResponse.json({ share_url: `${appUrl}/invoice/${token}` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to generate share link";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
