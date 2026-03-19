import { NextResponse } from "next/server";

import { processContractorMessage } from "@/lib/agent/contractor-agent";
import { createEvolutionClient } from "@/lib/evolution/client";
import type {
  ConnectionUpdateData,
  EvolutionWebhookPayload,
  MessagesUpsertData,
} from "@/lib/evolution/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractWhatsAppText } from "@/lib/webhooks/evolution-message";
import { allowWebhookEvent } from "@/lib/webhooks/rate-limit";
import { userIdFromInstanceName } from "@/lib/whatsapp/instance-name";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const header =
    request.headers.get("x-evolution-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    "";
  return header === secret;
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: EvolutionWebhookPayload;
  try {
    payload = (await request.json()) as EvolutionWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const instance =
    typeof payload.instance === "string" ? payload.instance : "";
  const userId = userIdFromInstanceName(instance);
  if (!userId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!allowWebhookEvent(instance)) {
    return NextResponse.json({ ok: true, rateLimited: true });
  }

  const eventRaw = String(payload.event ?? "").toLowerCase();
  const admin = createSupabaseAdminClient();

  try {
    if (eventRaw.includes("connection")) {
      await handleConnectionUpdate(admin, userId, instance, payload.data);
    }

    if (
      eventRaw.includes("messages.upsert") ||
      eventRaw.includes("messages_upsert") ||
      eventRaw === "messages.upsert"
    ) {
      for (const chunk of normalizeMessagesUpsertData(payload.data)) {
        await handleMessagesUpsert(admin, userId, instance, chunk);
      }
    }
  } catch (e) {
    console.error("evolution webhook handler error:", e);
  }

  return NextResponse.json({ ok: true });
}

function normalizeMessagesUpsertData(
  data: unknown,
): MessagesUpsertData[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as MessagesUpsertData[];
  if (typeof data === "object" && data !== null && "messages" in data) {
    const m = (data as { messages?: unknown }).messages;
    if (Array.isArray(m)) return m as MessagesUpsertData[];
  }
  return [data as MessagesUpsertData];
}

async function handleConnectionUpdate(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  instance: string,
  data: unknown,
) {
  const d = (data ?? {}) as ConnectionUpdateData;
  const state = String(d.state ?? d.status ?? "").toLowerCase();
  if (state.includes("open") || state === "connected") {
    await admin
      .from("profiles")
      .update({
        whatsapp_connected: true,
        whatsapp_instance_id: instance,
      })
      .eq("id", userId);
  } else if (
    state.includes("close") ||
    state.includes("logout") ||
    state === "disconnected"
  ) {
    await admin
      .from("profiles")
      .update({ whatsapp_connected: false })
      .eq("id", userId);
  }
}

async function handleMessagesUpsert(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  instance: string,
  data: unknown,
) {
  const msgData = (data ?? {}) as MessagesUpsertData;
  const key = msgData.key;
  if (!key) return;

  if (key.fromMe === true) return;

  const jid = key.remoteJid ?? "";
  if (jid.endsWith("@g.us")) return;

  const waMsgId =
    typeof key.id === "string" && key.id.length > 0 ? key.id : null;

  const text = extractWhatsAppText(msgData);
  if (!text) return;

  const { data: inserted, error: insErr } = await admin
    .from("messages")
    .insert({
      user_id: userId,
      project_id: null,
      direction: "inbound",
      content: text,
      message_type: "text",
      whatsapp_message_id: waMsgId,
      processed: false,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505") return;
    console.error("messages insert:", insErr);
    return;
  }

  const inboundId = inserted?.id;
  if (!inboundId) return;

  const { data: prior } = await admin
    .from("messages")
    .select("direction, content")
    .eq("user_id", userId)
    .neq("id", inboundId)
    .order("created_at", { ascending: false })
    .limit(10);

  const chronological = [...(prior ?? [])].reverse();
  const history = chronological.map((m) => ({
    role:
      m.direction === "inbound"
        ? ("user" as const)
        : ("assistant" as const),
    content: m.content,
  }));

  let reply: string;
  try {
    reply = await processContractorMessage(userId, text, history);
  } catch (e) {
    console.error("agent error:", e);
    reply =
      "Sorry, I'm having trouble processing that. Please try again in a moment.";
  }

  await admin.from("messages").insert({
    user_id: userId,
    project_id: null,
    direction: "outbound",
    content: reply,
    message_type: "text",
    whatsapp_message_id: null,
    processed: true,
  });

  await admin
    .from("messages")
    .update({ processed: true })
    .eq("id", inboundId);

  const evolution = createEvolutionClient();
  const to = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
  try {
    await evolution.sendText(instance, to, reply);
  } catch (e) {
    console.error("sendText error:", e);
  }
}
