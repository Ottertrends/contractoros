import { after } from "next/server";

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
export const maxDuration = 60;

export async function POST(request: Request) {
  // Read body first so we can log it
  const bodyText = await request.text();
  console.log("[evolution-webhook] RECEIVED body:", bodyText.slice(0, 800));

  let payload: EvolutionWebhookPayload;
  try {
    payload = JSON.parse(bodyText) as EvolutionWebhookPayload;
  } catch {
    console.error("[evolution-webhook] Invalid JSON");
    return new Response("OK", { status: 200 });
  }

  console.log(
    "[evolution-webhook] event:", payload.event,
    "| instance:", payload.instance,
  );

  // Verify optional webhook secret
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (secret) {
    const header =
      request.headers.get("x-evolution-webhook-secret") ??
      request.headers.get("x-webhook-secret") ??
      "";
    if (header !== secret) {
      console.warn("[evolution-webhook] Secret mismatch — rejected");
      // Return 200 to stop Evolution from retrying endlessly
      return new Response("OK", { status: 200 });
    }
  }

  // Return 200 immediately; process asynchronously so Evolution API doesn't timeout
  after(async () => {
    try {
      await processPayload(payload);
    } catch (e) {
      console.error("[evolution-webhook] Unhandled error in processPayload:", e);
    }
  });

  return new Response("OK", { status: 200 });
}

async function processPayload(payload: EvolutionWebhookPayload) {
  const instance =
    typeof payload.instance === "string" ? payload.instance : "";
  const userId = userIdFromInstanceName(instance);
  if (!userId) {
    console.log("[evolution-webhook] No userId from instance:", instance, "— skipping");
    return;
  }

  if (!allowWebhookEvent(instance)) {
    console.log("[evolution-webhook] Rate limited for instance:", instance);
    return;
  }

  const eventRaw = String(payload.event ?? "").toLowerCase();
  console.log("[evolution-webhook] Processing event:", eventRaw, "userId:", userId);

  const admin = createSupabaseAdminClient();

  if (eventRaw.includes("connection")) {
    await handleConnectionUpdate(admin, userId, instance, payload.data);
  }

  if (
    eventRaw.includes("messages.upsert") ||
    eventRaw.includes("messages_upsert") ||
    eventRaw === "messages.upsert"
  ) {
    const chunks = normalizeMessagesUpsertData(payload.data);
    console.log("[evolution-webhook] Processing", chunks.length, "message chunk(s)");
    for (const chunk of chunks) {
      await handleMessagesUpsert(admin, userId, instance, chunk);
    }
  }
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
  console.log("[evolution-webhook] connectionUpdate state:", state, "instance:", instance);

  if (state.includes("open") || state === "connected") {
    await admin
      .from("profiles")
      .update({ whatsapp_connected: true, whatsapp_instance_id: instance })
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
  if (!key) {
    console.log("[evolution-webhook] No key in message data — skipping");
    return;
  }

  if (key.fromMe === true) {
    console.log("[evolution-webhook] fromMe=true — skipping outbound");
    return;
  }

  const jid = key.remoteJid ?? "";
  if (jid.endsWith("@g.us")) {
    console.log("[evolution-webhook] Group message — skipping");
    return;
  }

  const waMsgId =
    typeof key.id === "string" && key.id.length > 0 ? key.id : null;

  const text = extractWhatsAppText(msgData);
  if (!text) {
    console.log("[evolution-webhook] No text extracted — skipping");
    return;
  }

  console.log("[evolution-webhook] Inbound text from", jid, ":", text.slice(0, 100));

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
    if (insErr.code === "23505") {
      console.log("[evolution-webhook] Duplicate message — skipping");
      return;
    }
    console.error("[evolution-webhook] messages insert error:", insErr);
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
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  console.log("[evolution-webhook] Calling Claude agent for userId:", userId);
  let reply: string;
  try {
    reply = await processContractorMessage(userId, text, history);
    console.log("[evolution-webhook] Agent reply:", reply.slice(0, 100));
  } catch (e) {
    console.error("[evolution-webhook] Agent error:", e);
    reply = "Sorry, I'm having trouble processing that. Please try again in a moment.";
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
  console.log("[evolution-webhook] Sending reply to:", to, "via instance:", instance);
  try {
    await evolution.sendText(instance, to, reply);
    console.log("[evolution-webhook] Reply sent successfully");
  } catch (e) {
    console.error("[evolution-webhook] sendText error:", e);
  }
}
