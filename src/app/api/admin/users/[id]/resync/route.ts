import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/admin/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { createEvolutionClient } from "@/lib/evolution/client";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: userId } = await params;
  const admin = createSupabaseAdminClient();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("whatsapp_instance_id, whatsapp_secondary_instance_id")
    .eq("id", userId)
    .single();

  const primary =
    (profile?.whatsapp_instance_id as string | null) ?? evolutionInstanceName(userId);
  const secondaryStored = profile?.whatsapp_secondary_instance_id as string | null;
  const secondary = secondaryStored ?? evolutionSecondaryInstanceName(userId);

  const webhookUrl = `${appUrl}/api/webhooks/evolution`;
  const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

  const evolution = createEvolutionClient();
  const synced: string[] = [];
  const errors: string[] = [];

  for (const instanceName of [primary, secondary]) {
    try {
      await evolution.setWebhook(instanceName, webhookUrl, events);
      synced.push(instanceName);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[admin/resync] setWebhook failed for", instanceName, msg);
      errors.push(`${instanceName}: ${msg}`);
    }
  }

  if (synced.length === 0) {
    return NextResponse.json(
      { ok: false, error: errors.join("; ") || "No instances synced" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    syncedInstances: synced,
    warnings: errors.length ? errors : undefined,
  });
}
