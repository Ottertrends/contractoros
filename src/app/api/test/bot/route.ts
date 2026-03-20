import { NextResponse } from "next/server";

import { processContractorMessage } from "@/lib/agent/contractor-agent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let message = "";
  try {
    const body = (await request.json()) as { message?: string };
    message = String(body.message ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  // Fetch recent conversation history (same as webhook handler)
  const { data: prior } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = [...(prior ?? [])]
    .reverse()
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  try {
    const result = await processContractorMessage(user.id, message, history);
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      agentError: result.error ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Agent failed" },
      { status: 500 },
    );
  }
}
