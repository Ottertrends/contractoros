import type { MessagesUpsertData } from "@/lib/evolution/types";

/** Unwrap viewOnce / ephemeral / edited wrappers to inner Baileys message */
function unwrapMessageNode(
  msg: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;

  const ephemeral = m.ephemeralMessage;
  if (ephemeral && typeof ephemeral === "object") {
    const inner = (ephemeral as { message?: unknown }).message;
    if (inner && typeof inner === "object") {
      return unwrapMessageNode(inner as Record<string, unknown>);
    }
  }

  const viewOnce = m.viewOnceMessage;
  if (viewOnce && typeof viewOnce === "object") {
    const inner = (viewOnce as { message?: unknown }).message;
    if (inner && typeof inner === "object") {
      return unwrapMessageNode(inner as Record<string, unknown>);
    }
  }

  const edited = m.editedMessage;
  if (edited && typeof edited === "object") {
    const inner = (edited as { message?: unknown }).message;
    if (inner && typeof inner === "object") {
      return unwrapMessageNode(inner as Record<string, unknown>);
    }
  }

  return m;
}

/** Best-effort extract user-visible text from Evolution v1 Baileys message payload */
export function extractWhatsAppText(data: MessagesUpsertData): string | null {
  const msg = data.message;
  if (!msg || typeof msg !== "object") return null;
  const m = unwrapMessageNode(msg as Record<string, unknown>);
  if (!m) return null;

  if (typeof m.conversation === "string" && m.conversation.trim()) {
    return m.conversation.trim();
  }
  const ext = m.extendedTextMessage;
  if (ext && typeof ext === "object") {
    const t = (ext as { text?: string }).text;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  const img = m.imageMessage;
  if (img && typeof img === "object") {
    const c = (img as { caption?: string }).caption;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const vid = m.videoMessage;
  if (vid && typeof vid === "object") {
    const c = (vid as { caption?: string }).caption;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const doc = m.documentMessage;
  if (doc && typeof doc === "object") {
    const c = (doc as { caption?: string }).caption;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}
