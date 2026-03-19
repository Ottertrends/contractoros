import { NextResponse } from "next/server";

import { createEvolutionClient, extractQrBase64 } from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evolutionInstanceName } from "@/lib/whatsapp/instance-name";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_instance_id")
      .eq("id", user.id)
      .single();

    const instanceName =
      profile?.whatsapp_instance_id ?? evolutionInstanceName(user.id);

    const evolution = createEvolutionClient();
    const connect = await evolution.getQRCode(instanceName);
    const qr = extractQrBase64(connect);

    return NextResponse.json({ qrCodeBase64: qr });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "QR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
