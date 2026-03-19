import type { MessagesUpsertData } from "@/lib/evolution/types";

/** Best-effort extract user-visible text from Evolution v1 Baileys message payload */
export function extractWhatsAppText(data: MessagesUpsertData): string | null {
  const msg = data.message;
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;

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
  return null;
}
