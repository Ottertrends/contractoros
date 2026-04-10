import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  // Fetch minimal profile for system-prompt context
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_name, services, business_areas")
    .eq("id", user.id)
    .single();

  const companyLine = profile?.company_name
    ? `The user runs a contracting company called "${profile.company_name}".`
    : "";
  const servicesLine =
    Array.isArray(profile?.services) && profile.services.length > 0
      ? `Their main services include: ${profile.services.join(", ")}.`
      : "";

  const systemPrompt = [
    "You are an AI assistant built into WorkSupp, a business management platform for contractors.",
    "You help contractors with invoices, project management, client communications, pricing, and general business questions.",
    companyLine,
    servicesLine,
    "Be concise, practical, and professional. When asked to draft emails or templates, provide them in full so the user can copy them directly.",
  ]
    .filter(Boolean)
    .join(" ");

  const stream = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
