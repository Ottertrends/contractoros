import { NextResponse } from "next/server";

import { createEvolutionClient } from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("whatsapp_instance_id, whatsapp_secondary_instance_id")
    .eq("id", user.id)
    .single();

  const primary =
    (profile?.whatsapp_instance_id as string | null) ?? evolutionInstanceName(user.id);
  const secondaryStored = profile?.whatsapp_secondary_instance_id as string | null;
  const secondary = secondaryStored ?? evolutionSecondaryInstanceName(user.id);

  const webhookUrl = `${appUrl}/api/webhooks/evolution`;
  const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

  const evolution = createEvolutionClient();
  const synced: string[] = [];
  const errors: string[] = [];

  for (const instanceName of [primary, secondary]) {
    try {
      console.log("[resync-webhook] instance:", instanceName, "url:", webhookUrl);
      await evolution.setWebhook(instanceName, webhookUrl, events);
      synced.push(instanceName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[resync-webhook] setWebhook failed for", instanceName, msg);
      errors.push(`${instanceName}: ${msg}`);
    }
  }

  if (synced.length === 0) {
    return NextResponse.json(
      { ok: false, error: errors.join("; ") || "No instances synced" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    syncedInstances: synced,
    warnings: errors.length ? errors : undefined,
  });
}
