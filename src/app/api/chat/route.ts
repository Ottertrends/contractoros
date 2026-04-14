import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremium, maxMonthlyMessages } from "@/lib/billing/access";
import { processContractorMessage } from "@/lib/agent/contractor-agent";

export const maxDuration = 60; // allow up to 60s for agent tool loops

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  // Fetch profile for access check
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_plan, subscription_status, subscription_seats")
    .eq("id", user.id)
    .single();

  // Free tier: check monthly message limit (shared with WhatsApp)
  if (!isPremium(profile ?? {})) {
    const limit = maxMonthlyMessages(profile ?? {});
    if (isFinite(limit)) {
      const admin = createSupabaseAdminClient();
      const thisMonth = new Date().toISOString().slice(0, 7);
      const { data: usageRows } = await admin
        .from("api_usage")
        .select("web_messages")
        .eq("user_id", user.id)
        .gte("date", `${thisMonth}-01`);
      const monthMessages = (usageRows ?? []).reduce(
        (a: number, r: { web_messages?: number }) => a + (r.web_messages ?? 0),
        0,
      );
      if (monthMessages >= limit) {
        return NextResponse.json(
          {
            error: `You've reached your ${limit} free messages for this month. Upgrade to Premium at /dashboard/billing for unlimited messages.`,
          },
          { status: 402 },
        );
      }
    }
  }

  // Extract the last user message and prior history
  const lastUserMessage = [...body.messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    return NextResponse.json({ error: "No user message found" }, { status: 400 });
  }
  const history = body.messages.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Run the full contractor agent (same as WhatsApp)
  const result = await processContractorMessage(user.id, lastUserMessage.content, history);

  // Track message usage (fire-and-forget)
  try {
    const admin = createSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    await admin.rpc("increment_usage", {
      p_user_id: user.id,
      p_date: today,
      p_web_messages: 1,
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ reply: result.reply });
}
