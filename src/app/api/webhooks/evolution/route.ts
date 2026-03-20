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
  const bodyText = await request.text();

  let payload: EvolutionWebhookPayload;
  try {
    payload = JSON.parse(bodyText) as EvolutionWebhookPayload;
  } catch {
    console.error("[evolution-webhook] Invalid JSON body");
    return new Response("OK", { status: 200 });
  }

  // 1. WEBHOOK RECEIVED
  console.log(
    "[evolution-webhook] WEBHOOK RECEIVED — event:", payload.event,
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
      return new Response("OK", { status: 200 });
    }
  }

  // Process inline — after() suppresses Vercel logs; maxDuration=60 gives plenty of headroom
  try {
    await processPayload(payload);
  } catch (e) {
    console.error("[evolution-webhook] Unhandled error in processPayload:", e);
  }

  return new Response("OK", { status: 200 });
}

async function processPayload(payload: EvolutionWebhookPayload) {
  const instance =
    typeof payload.instance === "string" ? payload.instance : "";
  const userId = userIdFromInstanceName(instance);
  if (!userId) {
    console.log("[evolution-webhook] No userId derived from instance:", instance, "— skipping");
    return;
  }

  if (!allowWebhookEvent(instance)) {
    console.log("[evolution-webhook] Rate limited for instance:", instance);
    return;
  }

  const eventRaw = String(payload.event ?? "").toLowerCase();
  console.log("[evolution-webhook] Processing event:", eventRaw, "| userId:", userId);

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
    const ownerJid = typeof payload.sender === "string" ? payload.sender.trim() : null;
    console.log("[evolution-webhook] Message chunks to process:", chunks.length, "| ownerJid:", ownerJid ?? "(none — will use profile phone)");
    for (const chunk of chunks) {
      await handleMessagesUpsert(admin, userId, instance, chunk, ownerJid);
    }
  }
}

function normalizeMessagesUpsertData(data: unknown): MessagesUpsertData[] {
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
  console.log("[evolution-webhook] connectionUpdate state:", state, "| instance:", instance);

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
  ownerJid: string | null,
) {
  const msgData = (data ?? {}) as MessagesUpsertData;
  const key = msgData.key;
  if (!key) {
    console.log("[evolution-webhook] No key in message data — skipping");
    return;
  }

  const jid = key.remoteJid ?? "";
  const fromMe = key.fromMe === true;

  // 2. MESSAGE EXTRACTED
  console.log(
    "[evolution-webhook] MESSAGE EXTRACTED — remoteJid:", jid,
    "| fromMe:", fromMe,
    "| messageId:", key.id,
  );

  if (jid.endsWith("@g.us")) {
    console.log("[evolution-webhook] Group message — skipping");
    return;
  }

  // Resolve owner JID: prefer payload.sender, fallback to profile phone
  let resolvedOwnerJid = ownerJid;
  if (!resolvedOwnerJid) {
    const { data: profile } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.phone) {
      const digits = String(profile.phone).replace(/\D/g, "");
      resolvedOwnerJid = digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
      console.log("[evolution-webhook] Owner JID from profile phone:", resolvedOwnerJid ?? `(too short: "${profile.phone}")`);
    } else {
      console.log("[evolution-webhook] No profile phone found for userId:", userId);
    }
  }

  // Self-chat filter: only activate bot when the user messages themselves
  if (!resolvedOwnerJid) {
    console.log("[evolution-webhook] WARNING: Cannot determine owner JID. Make sure your phone number is saved in your profile (Settings). Skipping bot.");
    return;
  }

  const normalizedJid = jid.split("@")[0].replace(/\D/g, "") + "@s.whatsapp.net";
  const normalizedOwner = resolvedOwnerJid.split("@")[0].replace(/\D/g, "") + "@s.whatsapp.net";
  const isSelfChat = fromMe && normalizedJid === normalizedOwner;

  console.log(
    "[evolution-webhook] Self-chat check | fromMe:", fromMe,
    "| remoteJid:", normalizedJid,
    "| owner:", normalizedOwner,
    "| match:", normalizedJid === normalizedOwner,
    "| isSelfChat:", isSelfChat,
  );

  if (!isSelfChat) {
    console.log("[evolution-webhook] Not a self-chat — bot stays silent");
    return;
  }

  console.log("[evolution-webhook] Self-chat confirmed — activating bot");

  const waMsgId =
    typeof key.id === "string" && key.id.length > 0 ? key.id : null;

  const text = extractWhatsAppText(msgData);

  // 2b. Log extracted text
  console.log(
    "[evolution-webhook] MESSAGE TEXT:", text ? `"${text.slice(0, 120)}"` : "(none — skipping)",
    "| fromMe:", fromMe,
  );

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
    if (insErr.code === "23505") {
      console.log("[evolution-webhook] Duplicate message (23505) — skipping");
      return;
    }
    console.error("[evolution-webhook] messages insert error:", insErr);
    return;
  }

  const inboundId = inserted?.id;
  if (!inboundId) {
    console.log("[evolution-webhook] Insert returned no id — skipping agent");
    return;
  }

  const { data: prior } = await admin
    .from("messages")
    .select("direction, content")
    .eq("user_id", userId)
    .neq("id", inboundId)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = [...(prior ?? [])]
    .reverse()
    .map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  // 3. AGENT CALLED
  console.log(
    "[evolution-webhook] AGENT CALLED — userId:", userId,
    "| text:", text.slice(0, 80),
    "| historyLen:", history.length,
  );

  let reply: string;
  try {
    reply = await processContractorMessage(userId, text, history);
    // 4. AGENT RESPONSE
    console.log("[evolution-webhook] AGENT RESPONSE:", reply.slice(0, 200));
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

  // 5. SEND REPLY
  console.log("[evolution-webhook] SEND REPLY — to:", to, "| instance:", instance, "| text:", reply.slice(0, 80));

  try {
    await evolution.sendText(instance, to, reply);
    // 6. REPLY SENT
    console.log("[evolution-webhook] REPLY SENT successfully to:", to);
  } catch (e) {
    // 6. REPLY FAILED
    console.error("[evolution-webhook] REPLY FAILED — to:", to, "| error:", e instanceof Error ? e.message : e);
  }
}
