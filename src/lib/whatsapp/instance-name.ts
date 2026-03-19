export function evolutionInstanceName(userId: string): string {
  return `user_${userId}`;
}

export function userIdFromInstanceName(instance: string): string | null {
  if (!instance.startsWith("user_")) return null;
  return instance.slice("user_".length) || null;
}

export function stripWhatsAppJid(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/i, "").replace(/@g\.us$/i, "");
}
