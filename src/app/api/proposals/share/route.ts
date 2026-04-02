import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function generateToken(len = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (const byte of arr) result += chars[byte % chars.length];
  return result;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { proposalId } = (await request.json()) as { proposalId: string };
    if (!proposalId)
      return NextResponse.json({ error: "proposalId required" }, { status: 400 });

    const { data: existing } = await supabase
      .from("proposals")
      .select("share_token")
      .eq("id", proposalId)
      .eq("user_id", user.id)
      .single();

    if (!existing)
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    if (existing.share_token) {
      return NextResponse.json({ shareToken: existing.share_token });
    }

    const token = generateToken();
    const { error } = await supabase
      .from("proposals")
      .update({ share_token: token, status: "sent", updated_at: new Date().toISOString() })
      .eq("id", proposalId)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ shareToken: token });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to generate share link";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
