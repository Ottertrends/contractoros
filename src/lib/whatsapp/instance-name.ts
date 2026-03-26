const USER_INSTANCE_UUID =
  /^user_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_2)?$/i;

export function evolutionInstanceName(userId: string): string {
  return `user_${userId}`;
}

/** Second WhatsApp line for the same ContractorOS user (Evolution instance name). */
export function evolutionSecondaryInstanceName(userId: string): string {
  return `user_${userId}_2`;
}

/**
 * Maps Evolution `payload.instance` → Supabase user id.
 * Accepts `user_<uuid>` (primary) or `user_<uuid>_2` (secondary).
 */
export function userIdFromInstanceName(instance: string): string | null {
  const m = instance.trim().match(USER_INSTANCE_UUID);
  return m?.[1] ?? null;
}

export function stripWhatsAppJid(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/i, "").replace(/@g\.us$/i, "");
}
