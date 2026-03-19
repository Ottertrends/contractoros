import { NextResponse } from "next/server";

import {
  createEvolutionClient,
  mapConnectionState,
} from "@/lib/evolution/client";
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
      .select("whatsapp_instance_id, whatsapp_connected")
      .eq("id", user.id)
      .single();

    const instanceName =
      profile?.whatsapp_instance_id ?? evolutionInstanceName(user.id);

    const evolution = createEvolutionClient();
    let raw: unknown;
    try {
      raw = await evolution.getInstanceStatus(instanceName);
    } catch {
      return NextResponse.json({
        status: "close" as const,
        connected: false,
        phone: null as string | null,
      });
    }

    const mapped = mapConnectionState(raw);
    const phone = extractPhoneFromStatus(raw);

    if (mapped.connected) {
      await supabase
        .from("profiles")
        .update({
          whatsapp_connected: true,
          whatsapp_instance_id: instanceName,
        })
        .eq("id", user.id);
    }

    return NextResponse.json({
      status: mapped.status,
      connected: mapped.connected,
      phone,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Status failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractPhoneFromStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const inst = o.instance;
  if (inst && typeof inst === "object") {
    const wid = (inst as { wid?: { user?: string } }).wid?.user;
    if (typeof wid === "string") return wid;
  }
  const wid = (o.wid as { user?: string } | undefined)?.user;
  if (typeof wid === "string") return wid;
  return null;
}
