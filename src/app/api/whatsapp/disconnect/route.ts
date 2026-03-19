import { NextResponse } from "next/server";

import { createEvolutionClient } from "@/lib/evolution/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
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

    const instanceName = profile?.whatsapp_instance_id;
    if (instanceName) {
      const evolution = createEvolutionClient();
      try {
        await evolution.logoutInstance(instanceName);
      } catch {
        /* ignore */
      }
      try {
        await evolution.deleteInstance(instanceName);
      } catch {
        /* ignore */
      }
    }

    await supabase
      .from("profiles")
      .update({
        whatsapp_connected: false,
        whatsapp_instance_id: null,
      })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Disconnect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
