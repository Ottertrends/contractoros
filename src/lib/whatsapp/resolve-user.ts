import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { userIdFromInstanceName } from "@/lib/whatsapp/instance-name";

/**
 * Resolve ContractorOS user from Evolution webhook instance name.
 * Tries `user_<uuid>` / `user_<uuid>_2` first, then profiles.whatsapp_instance_id / whatsapp_secondary_instance_id
 * for manually named Evolution instances.
 */
export async function resolveUserIdFromWebhookInstance(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  instance: string,
): Promise<string | null> {
  const trimmed = instance.trim();
  if (!trimmed) return null;

  const fromConvention = userIdFromInstanceName(trimmed);
  if (fromConvention) return fromConvention;

  const { data } = await admin
    .from("profiles")
    .select("id")
    .or(
      `whatsapp_instance_id.eq.${trimmed},whatsapp_secondary_instance_id.eq.${trimmed}`,
    )
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}
