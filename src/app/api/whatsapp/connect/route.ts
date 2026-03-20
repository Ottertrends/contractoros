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
    const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

    // Helper: create instance fresh, set webhook, return raw response
    async function createFresh(): Promise<unknown> {
      const res = await evolution.createInstance(instanceName, webhookUrl);
      console.log("[whatsapp/connect] instance created successfully");
      try {
        await evolution.setWebhook(instanceName, webhookUrl, WEBHOOK_EVENTS);
        console.log("[whatsapp/connect] webhook registered:", webhookUrl);
      } catch (we) {
        console.warn("[whatsapp/connect] setWebhook failed (non-fatal):", we instanceof Error ? we.message : we);
      }
      return res;
    }

    let created: unknown = null;

    try {
      created = await createFresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const alreadyExists =
        /\b409\b/.test(msg) ||
        /already\s+exist/i.test(msg) ||
        /\bduplicate\b/i.test(msg);

      if (!alreadyExists) throw e;

      console.log("[whatsapp/connect] instance already exists — re-registering webhook");
      try {
        await evolution.setWebhook(instanceName, webhookUrl, WEBHOOK_EVENTS);
      } catch (we) {
        console.warn("[whatsapp/connect] setWebhook failed (non-fatal):", we instanceof Error ? we.message : we);
      }
    }

    // Try to get QR — first from createInstance response, then via getQRCode endpoint
    let qr = await resolveQrDataUrl(created);

    if (!qr) {
      console.log("[whatsapp/connect] No QR in create response — calling getQRCode");
      try {
        const connect = await evolution.getQRCode(instanceName);
        qr = await resolveQrDataUrl(connect, created);
        console.log("[whatsapp/connect] getQRCode succeeded, QR:", qr ? "yes" : "no");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[whatsapp/connect] getQRCode failed:", msg);

        // If instance is broken (404 after "already exists"), delete and recreate
        if (/404|not found|does not exist/i.test(msg)) {
          console.log("[whatsapp/connect] Broken instance detected — deleting and recreating");
          try { await evolution.deleteInstance(instanceName); } catch (_) { /* ignore */ }
          try {
            created = await createFresh();
            qr = await resolveQrDataUrl(created);
            if (!qr) {
              const connect2 = await evolution.getQRCode(instanceName);
              qr = await resolveQrDataUrl(connect2, created);
            }
          } catch (recreateErr) {
            throw recreateErr;
          }
        }
      }
    }

    console.log("[whatsapp/connect] QR resolved:", qr ? "yes" : "no");

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
