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

/** Returns true only if the local part of a JID looks like a real phone number.
 *  Handles multi-device JIDs like 17372969713:4@s.whatsapp.net by stripping :XX suffix. */
function isPhoneJid(jid: string): boolean {
  const local = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return local.length >= 7 && local.length <= 15;
}

async function resolveOwnerWhatsappJid(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  payloadSender: string | null,
): Promise<string | null> {
  const raw = payloadSender?.trim();

  // Query profile for stored canonical JID AND phone in one call
  const { data: prof } = await admin
    .from("profiles")
    .select("phone, whatsapp_owner_jid")
    .eq("id", userId)
    .maybeSingle();

  // 1. Prefer stored canonical JID — set from a previous validated sender, most reliable
  if (prof?.whatsapp_owner_jid && typeof prof.whatsapp_owner_jid === "string") {
    console.log("[evolution-webhook] ownerJid from stored whatsapp_owner_jid:", prof.whatsapp_owner_jid);
    return prof.whatsapp_owner_jid;
  }

  // 2. Trust payload.sender if it looks like a real phone JID (not an instance UUID)
  if (raw && isPhoneJid(raw)) {
    // Normalize: strip device suffix (:XX) so "17372969713:4@s.whatsapp.net" → "17372969713@s.whatsapp.net"
    const canonical = `${raw.split("@")[0].split(":")[0]}@s.whatsapp.net`;
    console.log("[evolution-webhook] ownerJid from payload.sender:", raw, "→ canonical:", canonical);
    // Persist so future calls use exact match — no more digit guessing
    await admin.from("profiles").update({ whatsapp_owner_jid: canonical }).eq("id", userId);
    return canonical;
  }

  if (raw) {
    console.log("[evolution-webhook] payload.sender looks non-phone, ignoring:", raw);
  }

  // 3. Last resort: DB phone. For US 10-digit numbers prepend country code 1.
  const phone = prof?.phone;
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  const jid = `${normalized}@s.whatsapp.net`;
  console.log("[evolution-webhook] ownerJid from DB phone (normalized):", jid);
  return jid;
}

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
    const payloadSenderForConn =
      typeof payload.sender === "string" ? payload.sender.trim() : null;
    await handleConnectionUpdate(admin, userId, instance, payload.data, payloadSenderForConn);
  }

  if (
    eventRaw.includes("messages.upsert") ||
    eventRaw.includes("messages_upsert") ||
    eventRaw === "messages.upsert" ||
    eventRaw.includes("messagesupsert")
  ) {
    const chunks = normalizeMessagesUpsertData(payload.data);
    const payloadSender =
      typeof payload.sender === "string" ? payload.sender.trim() : null;
    const ownerJid = await resolveOwnerWhatsappJid(
      admin,
      userId,
      payloadSender,
    );
    console.log(
      "[evolution-webhook] Message chunks to process:",
      chunks.length,
      "| ownerJid:",
      ownerJid ?? "(none — cannot verify self-chat)",
      "| payload.sender:",
      payloadSender ?? "(empty)",
    );
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
  payloadSender?: string | null,
) {
  const d = (data ?? {}) as ConnectionUpdateData;
  const state = String(d.state ?? d.status ?? "").toLowerCase();
  console.log("[evolution-webhook] connectionUpdate state:", state, "| instance:", instance);

  if (state.includes("open") || state === "connected") {
    const patch: Record<string, unknown> = {
      whatsapp_connected: true,
      whatsapp_instance_id: instance,
    };
    // When connection opens, also store the canonical owner JID from payload.sender
    if (payloadSender && isPhoneJid(payloadSender)) {
      const canonical = `${payloadSender.split("@")[0].split(":")[0]}@s.whatsapp.net`;
      patch.whatsapp_owner_jid = canonical;
      console.log("[evolution-webhook] connectionUpdate: storing whatsapp_owner_jid:", canonical);
    }
    await admin.from("profiles").update(patch).eq("id", userId);
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

  // 2. MESSAGE EXTRACTED — [MSGRAW] is searchable in Vercel logs to see exact JID format
  console.log("[MSGRAW]", JSON.stringify({ remoteJid: jid, fromMe, messageId: key.id }));

  if (jid.endsWith("@g.us")) {
    console.log("[evolution-webhook] Group message — skipping");
    return;
  }

  // Only activate for outgoing messages (fromMe=true).
  if (!fromMe) {
    console.log("[evolution-webhook] fromMe=false — inbound from external, silent | remoteJid:", jid);
    return;
  }

  // Self-chat filter: only respond when the user messages their OWN number.
  // This prevents the bot firing when they send a message to a customer.
  //
  // WhatsApp Multi-Device uses two JID formats for self-messages:
  //   @s.whatsapp.net  — standard phone-number JID (compare digits against owner)
  //   @lid             — Linked Device ID (always a self/cross-device message, no comparison needed)
  if (jid.endsWith("@lid")) {
    // @lid JIDs are WhatsApp Linked Device IDs used for cross-device self-messages.
    // fromMe=true + @lid = always a self-chat — allow through unconditionally.
    console.log("[evolution-webhook] @lid JID (self-device message) — activating bot:", jid);
  } else if (ownerJid) {
    const digits = (j: string) => j.split("@")[0].split(":")[0].replace(/\D/g, "");
    const remote = digits(jid);
    const owner = digits(ownerJid);
    const isSelf = remote === owner || remote.endsWith(owner) || owner.endsWith(remote);
    // Unique searchable tag — search "[SELFCHAT-DEBUG]" in Vercel logs to see actual values
    console.log("[SELFCHAT-DEBUG]", JSON.stringify({ remote, owner, isSelf, jid, ownerJid }));
    if (!isSelf) {
      console.log("[evolution-webhook] Outgoing to external — skipping | remoteJid:", jid);
      return;
    }
  }

  console.log("[evolution-webhook] Self-chat confirmed — activating bot | remoteJid:", jid, "| ownerJid:", ownerJid ?? "(none)");

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
    const agentResult = await processContractorMessage(userId, text, history);
    reply = agentResult.reply;
    if (agentResult.error) {
      console.error(
        "[evolution-webhook] Agent error detail:",
        agentResult.error,
      );
    }
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
  // Prefer ownerJid (payload.sender) — it carries the full canonical JID with country code
  // (e.g. "17372969713@s.whatsapp.net"). key.remoteJid can strip the country code prefix.
  const sendTarget = ownerJid ?? jid;
  const to = sendTarget.includes("@") ? sendTarget : `${sendTarget}@s.whatsapp.net`;

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
