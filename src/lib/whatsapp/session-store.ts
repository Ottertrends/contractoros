import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type WaSessionSlice = {
  owner_jid?: string | null;
  owner_lid?: string | null;
  lid_pending?: boolean;
};

type ProfileRow = {
  whatsapp_sessions?: unknown;
  whatsapp_instance_id?: string | null;
  whatsapp_owner_jid?: string | null;
  whatsapp_owner_lid?: string | null;
  whatsapp_lid_pending?: boolean | null;
};

/** Read per-instance self-chat state; falls back to legacy columns for the primary instance. */
export function getSessionSlice(
  profile: ProfileRow | null | undefined,
  instanceName: string,
  /** When DB `whatsapp_instance_id` is still null, match canonical `user_<uuid>`. */
  canonicalPrimaryInstanceName?: string,
): {
  ownerJid: string | null;
  ownerLid: string | null;
  lidPending: boolean;
} {
  const sessions =
    (profile?.whatsapp_sessions as Record<string, WaSessionSlice> | null) ?? null;
  const slice = sessions?.[instanceName];
  const hasJsonSlice =
    slice &&
    (slice.owner_jid != null ||
      slice.owner_lid != null ||
      typeof slice.lid_pending === "boolean");

  if (hasJsonSlice && slice) {
    // profile.whatsapp_lid_pending is only meaningful for the primary instance —
    // the bootstrap code only clears it when isPrimaryInstance() is true.
    // For secondary instances we must rely solely on the per-session JSONB slice;
    // otherwise the secondary is permanently stuck in bootstrap mode after reconnect.
    const primaryId = profile?.whatsapp_instance_id ?? canonicalPrimaryInstanceName;
    const isThisPrimary = !!primaryId && instanceName === primaryId;
    const profileLidPending = isThisPrimary ? !!(profile?.whatsapp_lid_pending) : false;

    return {
      ownerJid: (slice.owner_jid as string | null) ?? null,
      ownerLid: (slice.owner_lid as string | null) ?? null,
      lidPending: profileLidPending || !!(slice.lid_pending ?? false),
    };
  }

  const isPrimaryRow =
    !!instanceName &&
    (instanceName === profile?.whatsapp_instance_id ||
      (!!canonicalPrimaryInstanceName &&
        instanceName === canonicalPrimaryInstanceName));

  if (isPrimaryRow) {
    return {
      ownerJid: (profile?.whatsapp_owner_jid as string | null) ?? null,
      ownerLid: (profile?.whatsapp_owner_lid as string | null) ?? null,
      lidPending: !!(profile?.whatsapp_lid_pending ?? false),
    };
  }

  return { ownerJid: null, ownerLid: null, lidPending: false };
}

export async function mergeWaSession(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  instanceName: string,
  patch: Partial<WaSessionSlice>,
): Promise<void> {
  const { data: prof } = await admin
    .from("profiles")
    .select("whatsapp_sessions")
    .eq("id", userId)
    .maybeSingle();

  const prev =
    (prof?.whatsapp_sessions as Record<string, WaSessionSlice> | null) ?? {};
  const sessions = { ...prev };
  const cur = sessions[instanceName] ?? {};
  sessions[instanceName] = { ...cur, ...patch };

  await admin.from("profiles").update({ whatsapp_sessions: sessions }).eq("id", userId);
}

/** Write a single event row to bot_events for in-app diagnostics. Fire-and-forget safe. */
export async function logBotEvent(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  eventType: "received" | "skipped" | "bootstrap" | "agent" | "replied" | "error",
  result: string,
  jid?: string,
  summary?: string,
): Promise<void> {
  try {
    await admin.from("bot_events").insert({
      user_id: userId,
      event_type: eventType,
      result,
      jid: jid ? jid.slice(0, 64) : null,
      summary: summary ? summary.slice(0, 200) : null,
    });
    // Prune events older than 7 days for this user (on every insert is fine given low volume)
    await admin
      .from("bot_events")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  } catch {
    // never let logging break the webhook
  }
}

/** Remove one instance key from whatsapp_sessions (e.g. after disconnect). */
export async function deleteWaSessionKey(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  instanceName: string,
): Promise<void> {
  const { data: prof } = await admin
    .from("profiles")
    .select("whatsapp_sessions")
    .eq("id", userId)
    .maybeSingle();

  const prev =
    (prof?.whatsapp_sessions as Record<string, WaSessionSlice> | null) ?? {};
  if (!(instanceName in prev)) return;

  const sessions = { ...prev };
  delete sessions[instanceName];

  await admin.from("profiles").update({ whatsapp_sessions: sessions }).eq("id", userId);
}
