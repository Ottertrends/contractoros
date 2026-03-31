import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { enabled } = (await request.json()) as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("profiles")
      .update({ notifications_enabled: enabled })
      .eq("id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, notifications_enabled: enabled });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Toggle failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
