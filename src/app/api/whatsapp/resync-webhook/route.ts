import { NextResponse } from "next/server";

import { createEvolutionClient } from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evolutionInstanceName } from "@/lib/whatsapp/instance-name";

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
    .select("whatsapp_instance_id")
    .eq("id", user.id)
    .single();

  const instanceName =
    (profile?.whatsapp_instance_id as string | null) ?? evolutionInstanceName(user.id);
  const webhookUrl = `${appUrl}/api/webhooks/evolution`;
  const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

  console.log("[resync-webhook] instance:", instanceName, "url:", webhookUrl);

  const evolution = createEvolutionClient();

  try {
    await evolution.setWebhook(instanceName, webhookUrl, events);
    console.log("[resync-webhook] setWebhook succeeded");
    return NextResponse.json({ ok: true, instanceName, webhookUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[resync-webhook] setWebhook failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
