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
    return {
      ownerJid: (slice.owner_jid as string | null) ?? null,
      ownerLid: (slice.owner_lid as string | null) ?? null,
      lidPending: slice.lid_pending ?? false,
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
