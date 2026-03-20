import { NextResponse } from "next/server";

import {
  createEvolutionClient,
  resolveQrDataUrl,
} from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evolutionInstanceName } from "@/lib/whatsapp/instance-name";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_APP_URL" },
        { status: 500 },
      );
    }

    const instanceName = evolutionInstanceName(user.id);
    const webhookUrl = `${appUrl}/api/webhooks/evolution`;
    console.log("[whatsapp/connect] instanceName:", instanceName);
    console.log("[whatsapp/connect] webhookUrl:", webhookUrl);

    const evolution = createEvolutionClient();
    let created: unknown = null;
    let instanceAlreadyExists = false;

    try {
      created = await evolution.createInstance(instanceName, webhookUrl);
      console.log("[whatsapp/connect] instance created successfully");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log("[whatsapp/connect] createInstance error:", msg);

      const instanceExists =
        /\b409\b/.test(msg) ||
        /\balready\b/i.test(msg) ||
        /\bexist/i.test(msg) ||
        /\bduplicate/i.test(msg);

      if (!instanceExists) throw e;
      console.log("[whatsapp/connect] instance already exists — will re-register webhook");
      instanceAlreadyExists = true;
    }

    // Always (re)register the webhook — critical if instance already existed
    // or if the createInstance webhook param was ignored by the server
    const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
    try {
      await evolution.setWebhook(instanceName, webhookUrl, WEBHOOK_EVENTS);
      console.log("[whatsapp/connect] webhook registered:", webhookUrl);
    } catch (e) {
      // setWebhook may not exist on some Evolution v1 builds — log and continue
      console.warn(
        "[whatsapp/connect] setWebhook failed (may be unsupported):",
        e instanceof Error ? e.message : e,
      );
    }

    // Fetch QR code
    let connect: unknown;
    try {
      connect = await evolution.getQRCode(instanceName);
      console.log("[whatsapp/connect] QR fetched");
    } catch (e) {
      console.error("[whatsapp/connect] getQRCode error:", e instanceof Error ? e.message : e);
      throw e;
    }

    const qr = await resolveQrDataUrl(created, connect);
    console.log("[whatsapp/connect] QR resolved:", qr ? "yes" : "no", "instanceAlreadyExisted:", instanceAlreadyExists);

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        whatsapp_instance_id: instanceName,
        whatsapp_connected: false,
      })
      .eq("id", user.id);

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({
      instanceName,
      qrCodeBase64: qr,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Connect failed";
    console.error("[whatsapp/connect] handler failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
