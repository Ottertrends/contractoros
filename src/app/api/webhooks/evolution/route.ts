import { processContractorMessage } from "@/lib/agent/contractor-agent";
import { createEvolutionClient } from "@/lib/evolution/client";
import type {
  ConnectionUpdateData,
  EvolutionWebhookPayload,
  MessagesUpsertData,
} from "@/lib/evolution/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractWhatsAppText, extractWhatsAppMedia } from "@/lib/webhooks/evolution-message";
import { allowWebhookEvent } from "@/lib/webhooks/rate-limit";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";
import { resolveUserIdFromWebhookInstance } from "@/lib/whatsapp/resolve-user";
import { getSessionSlice, mergeWaSession } from "@/lib/whatsapp/session-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return new Response(JSON.stringify({ ok: true, service: "evolution-webhook" }), {
    headers: { "content-type": "application/json" },
  });
}

/** Returns true only if the local part of a JID looks like a real phone number.
 *  Handles multi-device JIDs like 17372969713:4@s.whatsapp.net by stripping :XX suffix. */
function isPhoneJid(jid: string): boolean {
  const local = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return local.length >= 7 && local.length <= 15;
}

function connectionSlot(
  instance: string,
  primaryStored: string | null | undefined,
  secondaryStored: string | null | undefined,
  userId: string,
): "primary" | "secondary" {
  const primaryId = primaryStored ?? evolutionInstanceName(userId);
  const secondaryId = secondaryStored ?? evolutionSecondaryInstanceName(userId);
  if (instance === primaryId) return "primary";
  if (instance === secondaryId) return "secondary";
  if (secondaryStored && instance === secondaryStored) return "secondary";
  if (primaryStored && instance === primaryStored) return "primary";
  return instance.endsWith("_2") ? "secondary" : "primary";
}

function isPrimaryInstance(
  instance: string,
  prof: { whatsapp_instance_id?: string | null } | null | undefined,
  userId: string,
): boolean {
  return instance === (prof?.whatsapp_instance_id ?? evolutionInstanceName(userId));
}

async function resolveOwnerJids(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  instanceName: string,
  payloadSender: string | null,
): Promise<{ ownerJid: string | null; ownerLid: string | null; lidPending: boolean }> {
  const raw = payloadSender?.trim();

  const { data: prof } = await admin
    .from("profiles")
    .select(
      "phone, whatsapp_instance_id, whatsapp_sessions, whatsapp_owner_jid, whatsapp_owner_lid, whatsapp_lid_pending",
    )
    .eq("id", userId)
    .maybeSingle();

  const { ownerJid: storedJid, ownerLid, lidPending } = getSessionSlice(
    prof,
    instanceName,
    evolutionInstanceName(userId),
  );

  // 1. Prefer stored canonical JID for this Evolution instance
  if (storedJid && typeof storedJid === "string") {
    console.log(
      "[evolution-webhook] ownerJid from session:",
      instanceName,
      storedJid,
    );
    return { ownerJid: storedJid, ownerLid, lidPending };
  }

  // 2. Trust payload.sender if it looks like a real phone JID
  if (raw && isPhoneJid(raw)) {
    const canonical = `${raw.split("@")[0].split(":")[0]}@s.whatsapp.net`;
    console.log(
      "[evolution-webhook] ownerJid from payload.sender:",
      raw,
      "→ canonical:",
      canonical,
    );
    await mergeWaSession(admin, userId, instanceName, { owner_jid: canonical });
    if (isPrimaryInstance(instanceName, prof, userId)) {
      await admin.from("profiles").update({ whatsapp_owner_jid: canonical }).eq("id", userId);
    }
    return { ownerJid: canonical, ownerLid, lidPending };
  }

  if (raw) {
    console.log("[evolution-webhook] payload.sender looks non-phone, ignoring:", raw);
  }

  // 3. Last resort: profile phone (shared). US 10-digit → prepend 1.
  const phone = prof?.phone;
  if (!phone || typeof phone !== "string")
    return { ownerJid: null, ownerLid, lidPending };
  const digits = phone.replace(/\D/g, "");
  if (!digits) return { ownerJid: null, ownerLid, lidPending };
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  const ownerJid = `${normalized}@s.whatsapp.net`;
  console.log("[evolution-webhook] ownerJid from DB phone (normalized):", ownerJid);
  return { ownerJid, ownerLid, lidPending };
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

  console.log(
    "[evolution-webhook] WEBHOOK RECEIVED — event:",
    payload.event,
    "| instance:",
    payload.instance,
  );

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

  const admin = createSupabaseAdminClient();
  const userId = await resolveUserIdFromWebhookInstance(admin, instance);
  if (!userId) {
    console.log(
      "[evolution-webhook] No userId derived from instance:",
      instance,
      "— skipping",
    );
    return;
  }

  if (!allowWebhookEvent(instance)) {
    console.log("[evolution-webhook] Rate limited for instance:", instance);
    return;
  }

  const eventRaw = String(payload.event ?? "").toLowerCase();
  console.log("[evolution-webhook] Processing event:", eventRaw, "| userId:", userId);

  if (eventRaw.includes("connection")) {
    const payloadSenderForConn =
      typeof payload.sender === "string" ? payload.sender.trim() : null;
    await handleConnectionUpdate(
      admin,
      userId,
      instance,
      payload.data,
      payloadSenderForConn,
    );
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
    const { ownerJid, ownerLid, lidPending } = await resolveOwnerJids(
      admin,
      userId,
      instance,
      payloadSender,
    );
    console.log(
      "[evolution-webhook] Message chunks to process:",
      chunks.length,
      "| ownerJid:",
      ownerJid ?? "(none)",
      "| ownerLid:",
      ownerLid ?? "(none)",
      "| lidPending:",
      lidPending,
      "| payload.sender:",
      payloadSender ?? "(empty)",
    );
    for (const chunk of chunks) {
      await handleMessagesUpsert(
        admin,
        userId,
        instance,
        chunk,
        ownerJid,
        ownerLid,
        lidPending,
      );
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

  const { data: prof } = await admin
    .from("profiles")
    .select("whatsapp_instance_id, whatsapp_secondary_instance_id")
    .eq("id", userId)
    .maybeSingle();

  const slot = connectionSlot(
    instance,
    prof?.whatsapp_instance_id,
    prof?.whatsapp_secondary_instance_id,
    userId,
  );

  if (state.includes("open") || state === "connected") {
    const patch: Record<string, unknown> =
      slot === "primary"
        ? { whatsapp_connected: true, whatsapp_instance_id: instance }
        : { whatsapp_secondary_connected: true, whatsapp_secondary_instance_id: instance };

    if (payloadSender && isPhoneJid(payloadSender)) {
      const canonical = `${payloadSender.split("@")[0].split(":")[0]}@s.whatsapp.net`;
      await mergeWaSession(admin, userId, instance, { owner_jid: canonical });
      if (slot === "primary") {
        patch.whatsapp_owner_jid = canonical;
      }
      console.log(
        "[evolution-webhook] connectionUpdate: storing owner_jid for",
        instance,
        canonical,
      );
    }
    await admin.from("profiles").update(patch).eq("id", userId);
  } else if (
    state.includes("close") ||
    state.includes("logout") ||
    state === "disconnected"
  ) {
    const patch: Record<string, unknown> =
      slot === "primary"
        ? { whatsapp_connected: false }
        : { whatsapp_secondary_connected: false };
    await admin.from("profiles").update(patch).eq("id", userId);
  }
}

async function handleMessagesUpsert(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  instance: string,
  data: unknown,
  ownerJid: string | null,
  ownerLid: string | null,
  lidPending: boolean,
) {
  const msgData = (data ?? {}) as MessagesUpsertData;
  const key = msgData.key;
  if (!key) {
    console.log("[evolution-webhook] No key in message data — skipping");
    return;
  }

  const jid = key.remoteJid ?? "";
  const fromMe = key.fromMe === true;

  console.log("[evolution-webhook] Message | remoteJid:", jid, "| fromMe:", fromMe);

  if (jid.endsWith("@g.us")) {
    console.log("[evolution-webhook] Group message — skipping");
    return;
  }

  if (!fromMe) {
    console.log(
      "[evolution-webhook] fromMe=false — inbound from external, silent | remoteJid:",
      jid,
    );
    return;
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("whatsapp_instance_id")
    .eq("id", userId)
    .maybeSingle();

  if (jid.endsWith("@lid")) {
    if (lidPending) {
      console.log("[evolution-webhook] @lid — lid_pending bootstrap, storing LID:", jid);
      await mergeWaSession(admin, userId, instance, {
        owner_lid: jid,
        lid_pending: false,
      });
      if (isPrimaryInstance(instance, prof, userId)) {
        await admin
          .from("profiles")
          .update({ whatsapp_owner_lid: jid, whatsapp_lid_pending: false })
          .eq("id", userId);
      }
    } else if (ownerLid) {
      if (jid !== ownerLid) {
        console.log(
          "[evolution-webhook] @lid — not owner LID, skipping | jid:",
          jid,
          "| ownerLid:",
          ownerLid,
        );
        return;
      }
      console.log("[evolution-webhook] @lid — owner LID match ✅ | jid:", jid);
    } else {
      console.log("[evolution-webhook] @lid — no ownerLid and not pending, skipping");
      return;
    }
  } else {
    if (!ownerJid) {
      console.log("[evolution-webhook] No ownerJid stored — skipping");
      return;
    }
    const ownerDigits = ownerJid.split("@")[0].split(":")[0].replace(/\D/g, "");
    const remoteDigits = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
    const isSelfChat =
      ownerDigits.length >= 7 &&
      (remoteDigits === ownerDigits ||
        remoteDigits.endsWith(ownerDigits) ||
        ownerDigits.endsWith(remoteDigits));
    console.log("[evolution-webhook] Self-chat check | remoteDigits:", remoteDigits, "| ownerDigits:", ownerDigits, "| match:", isSelfChat);
    if (!isSelfChat) {
      console.log("[evolution-webhook] Not self-chat — skipping | remoteJid:", jid);
      return;
    }
  }

  console.log(
    "[evolution-webhook] Self-chat confirmed — activating bot | remoteJid:",
    jid,
    "| ownerJid:",
    ownerJid ?? "(none)",
  );

  const waMsgId =
    typeof key.id === "string" && key.id.length > 0 ? key.id : null;

  const text = extractWhatsAppText(msgData);
  const mediaInfo = extractWhatsAppMedia(msgData);

  console.log(
    "[evolution-webhook] MESSAGE TEXT:",
    text ? `"${text.slice(0, 120)}"` : "(none)",
    "| MEDIA:", mediaInfo ? `${mediaInfo.type} (${mediaInfo.mimeType})` : "none",
    "| fromMe:", fromMe,
  );

  if (!text && !mediaInfo) {
    console.log("[evolution-webhook] No text or media — skipping");
    return;
  }

  // Handle media upload if present
  let mediaContext: string | null = null;
  if (mediaInfo) {
    try {
      const evolution = createEvolutionClient();
      const { base64, mimetype } = await evolution.getMediaBase64(instance, msgData);
      const mimeToUse = mimetype || mediaInfo.mimeType;

      const extMap: Record<string, string> = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
      };
      const ext = extMap[mimeToUse] ?? (mediaInfo.type === "image" ? "jpg" : "mp4");
      const mediaUuid = crypto.randomUUID();
      const storagePath = `${userId}/${mediaUuid}.${ext}`;

      const buffer = Buffer.from(base64, "base64");
      const { error: uploadErr } = await admin.storage
        .from("project-media")
        .upload(storagePath, buffer, { contentType: mimeToUse });

      if (uploadErr) {
        console.error("[evolution-webhook] Storage upload error:", uploadErr.message);
      } else {
        const { data: mediaRow } = await admin
          .from("project_media")
          .insert({
            user_id: userId,
            project_id: null,
            storage_path: storagePath,
            media_type: mediaInfo.type,
            mime_type: mimeToUse,
            description: mediaInfo.caption,
            whatsapp_message_id: waMsgId,
            file_size_bytes: buffer.length,
          })
          .select("id")
          .single();

        if (mediaRow?.id) {
          const emoji = mediaInfo.type === "video" ? "🎥" : "📸";
          const label = mediaInfo.type === "video" ? "Video" : "Image";
          const captionPart = mediaInfo.caption ? `: "${mediaInfo.caption}"` : " (no caption)";
          mediaContext = `${emoji} ${label} received${captionPart}. Media ID: ${mediaRow.id}`;
          console.log("[evolution-webhook] Media uploaded:", storagePath, "| mediaId:", mediaRow.id);
        }
      }
    } catch (mediaErr) {
      console.error("[evolution-webhook] Media processing error:", mediaErr instanceof Error ? mediaErr.message : mediaErr);
    }

    // If upload failed (or getMediaBase64 failed), still build a fallback so the agent can respond
    if (!mediaContext) {
      const emoji = mediaInfo.type === "video" ? "🎥" : "📸";
      const label = mediaInfo.type === "video" ? "Video" : "Image";
      const captionPart = mediaInfo.caption ? `: "${mediaInfo.caption}"` : "";
      mediaContext = `${emoji} ${label} received${captionPart}. (Media could not be saved — please resend if needed.)`;
      console.log("[evolution-webhook] Using fallback mediaContext (upload failed)");
    }
  }

  // Build the agent message: combine text + media context
  const agentText = [text, mediaContext].filter(Boolean).join("\n\n");
  if (!agentText) {
    console.log("[evolution-webhook] No text or media — skipping");
    return;
  }

  const { data: inserted, error: insErr } = await admin
    .from("messages")
    .insert({
      user_id: userId,
      project_id: null,
      direction: "inbound",
      content: agentText,
      message_type: mediaInfo ? "image" : "text",
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

  console.log(
    "[evolution-webhook] AGENT CALLED — userId:",
    userId,
    "| text:",
    agentText.slice(0, 80),
    "| historyLen:",
    history.length,
  );

  let reply: string;
  try {
    const agentResult = await processContractorMessage(userId, agentText, history);
    reply = agentResult.reply;
    if (agentResult.error) {
      console.error("[evolution-webhook] Agent error detail:", agentResult.error);
    }
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

  await admin.from("messages").update({ processed: true }).eq("id", inboundId);

  const evolution = createEvolutionClient();
  const sendTarget = ownerJid ?? jid;
  const to = sendTarget.endsWith("@lid")
    ? (ownerJid ?? jid)
    : sendTarget.includes("@")
      ? sendTarget
      : `${sendTarget}@s.whatsapp.net`;

  console.log(
    "[evolution-webhook] SEND REPLY — to:",
    to,
    "| instance:",
    instance,
    "| text:",
    reply.slice(0, 80),
  );

  try {
    await evolution.sendText(instance, to, reply);
    console.log("[evolution-webhook] REPLY SENT successfully to:", to);
  } catch (e) {
    console.error(
      "[evolution-webhook] REPLY FAILED — to:",
      to,
      "| error:",
      e instanceof Error ? e.message : e,
    );
  }
}
