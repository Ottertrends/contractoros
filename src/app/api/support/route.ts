import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json() as { message?: string };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 10) {
      return NextResponse.json({ error: "Message too short" }, { status: 400 });
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("support_messages").insert({
      user_id: user.id,
      user_name: profile?.full_name ?? null,
      user_email: profile?.email ?? user.email ?? null,
      message,
      status: "unread",
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
