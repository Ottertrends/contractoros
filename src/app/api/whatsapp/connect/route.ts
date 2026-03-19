import { NextResponse } from "next/server";

import {
  createEvolutionClient,
  extractQrBase64,
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

    const evolution = createEvolutionClient();
    const created = await evolution.createInstance(instanceName, webhookUrl);
    const connect = await evolution.getQRCode(instanceName);
    const qr =
      extractQrBase64(created) ??
      extractQrBase64(connect) ??
      null;

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
