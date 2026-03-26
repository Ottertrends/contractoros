import { NextResponse } from "next/server";

import {
  createEvolutionClient,
  mapConnectionState,
} from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";

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
      .select(
        "whatsapp_instance_id, whatsapp_secondary_instance_id, whatsapp_connected, whatsapp_secondary_connected",
      )
      .eq("id", user.id)
      .single();

    const primaryName =
      profile?.whatsapp_instance_id ?? evolutionInstanceName(user.id);
    const secondaryName =
      profile?.whatsapp_secondary_instance_id ??
      evolutionSecondaryInstanceName(user.id);

    const evolution = createEvolutionClient();

    const primaryState = await fetchInstanceState(evolution, primaryName);
    const secondaryState = await fetchInstanceState(evolution, secondaryName);

    const patch: Record<string, unknown> = {};
    if (primaryState.connected) {
      patch.whatsapp_connected = true;
      patch.whatsapp_instance_id = primaryName;
    }
    if (secondaryState.connected) {
      patch.whatsapp_secondary_connected = true;
      patch.whatsapp_secondary_instance_id = secondaryName;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("profiles").update(patch).eq("id", user.id);
    }

    return NextResponse.json({
      status: primaryState.status,
      connected: primaryState.connected,
      phone: primaryState.phone,
      secondary_status: secondaryState.status,
      secondary_connected: secondaryState.connected,
      secondary_phone: secondaryState.phone,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Status failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchInstanceState(
  evolution: ReturnType<typeof createEvolutionClient>,
  instanceName: string,
): Promise<{ status: string; connected: boolean; phone: string | null }> {
  try {
    const raw = await evolution.getInstanceStatus(instanceName);
    const mapped = mapConnectionState(raw);
    const phone = extractPhoneFromStatus(raw);
    return {
      status: mapped.status,
      connected: mapped.connected,
      phone,
    };
  } catch {
    return { status: "close", connected: false, phone: null };
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
