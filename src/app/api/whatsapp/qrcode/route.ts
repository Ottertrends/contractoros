import { NextResponse } from "next/server";

import { createEvolutionClient, resolveQrDataUrl } from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const slot = url.searchParams.get("slot") === "secondary" ? "secondary" : "primary";

    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_instance_id, whatsapp_secondary_instance_id")
      .eq("id", user.id)
      .single();

    const instanceName =
      slot === "secondary"
        ? (profile?.whatsapp_secondary_instance_id ??
            evolutionSecondaryInstanceName(user.id))
        : (profile?.whatsapp_instance_id ?? evolutionInstanceName(user.id));

    const evolution = createEvolutionClient();
    const connect = await evolution.getQRCode(instanceName);
    const qr = await resolveQrDataUrl(connect);

    return NextResponse.json({ qrCodeBase64: qr, slot, instanceName });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "QR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
