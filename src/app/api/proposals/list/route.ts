import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("proposals")
      .select(
        "id, project_id, title, client_name, project_name, status, valid_until, line_items, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to list proposals";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
