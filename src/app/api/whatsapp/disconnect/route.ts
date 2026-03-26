import { NextResponse } from "next/server";

import { createEvolutionClient } from "@/lib/evolution/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";
import { deleteWaSessionKey } from "@/lib/whatsapp/session-store";

async function logoutAndDelete(evolution: ReturnType<typeof createEvolutionClient>, name: string) {
  try {
    await evolution.logoutInstance(name);
  } catch {
    /* ignore */
  }
  try {
    await evolution.deleteInstance(name);
  } catch {
    /* ignore */
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let mode: "primary" | "secondary" | "all" = "primary";
    try {
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const j = (await request.json()) as { slot?: string };
        if (j.slot === "secondary") mode = "secondary";
        else if (j.slot === "all") mode = "all";
      }
    } catch {
      /* default */
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_instance_id, whatsapp_secondary_instance_id")
      .eq("id", user.id)
      .single();

    const evolution = createEvolutionClient();
    const admin = createSupabaseAdminClient();

    const primaryName =
      profile?.whatsapp_instance_id ?? evolutionInstanceName(user.id);
    const secondaryResolved =
      profile?.whatsapp_secondary_instance_id ??
      evolutionSecondaryInstanceName(user.id);

    if (mode === "all" || mode === "primary") {
      await logoutAndDelete(evolution, primaryName);
      await deleteWaSessionKey(admin, user.id, primaryName);
    }
    if (mode === "all" || mode === "secondary") {
      await logoutAndDelete(evolution, secondaryResolved);
      await deleteWaSessionKey(admin, user.id, secondaryResolved);
    }

    const patch: Record<string, unknown> = {};
    if (mode === "all") {
      patch.whatsapp_connected = false;
      patch.whatsapp_instance_id = null;
      patch.whatsapp_secondary_connected = false;
      patch.whatsapp_secondary_instance_id = null;
      patch.whatsapp_owner_jid = null;
      patch.whatsapp_owner_lid = null;
      patch.whatsapp_lid_pending = false;
    } else if (mode === "primary") {
      patch.whatsapp_connected = false;
      patch.whatsapp_instance_id = null;
      patch.whatsapp_owner_jid = null;
      patch.whatsapp_owner_lid = null;
      patch.whatsapp_lid_pending = false;
    } else {
      patch.whatsapp_secondary_connected = false;
      patch.whatsapp_secondary_instance_id = null;
    }

    await supabase.from("profiles").update(patch).eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Disconnect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
