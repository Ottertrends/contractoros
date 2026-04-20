import { NextResponse } from "next/server";

import {
  createEvolutionClient,
  extractPairingCode,
  resolveQrDataUrl,
} from "@/lib/evolution/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";
import { mergeWaSession } from "@/lib/whatsapp/session-store";

export const maxDuration = 60; // pairing code polling can take up to 12s

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let slot: "primary" | "secondary" = "primary";
    let phoneNumber: string | null = null;
    try {
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const j = (await request.json()) as { slot?: string; phoneNumber?: string };
        if (j.slot === "secondary") slot = "secondary";
        if (typeof j.phoneNumber === "string") {
          const digits = j.phoneNumber.replace(/\D/g, "");
          if (digits.length >= 10) phoneNumber = digits;
        }
      }
    } catch {
      /* default primary */
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_APP_URL" },
        { status: 500 },
      );
    }

    const instanceName =
      slot === "secondary"
        ? evolutionSecondaryInstanceName(user.id)
        : evolutionInstanceName(user.id);
    const webhookUrl = `${appUrl}/api/webhooks/evolution`;
    console.log("[whatsapp/connect] slot:", slot, "instanceName:", instanceName);
    console.log("[whatsapp/connect] webhookUrl:", webhookUrl);

    const evolution = createEvolutionClient();
    const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

    async function createFresh(): Promise<unknown> {
      const res = await evolution.createInstance(instanceName, webhookUrl);
      console.log("[whatsapp/connect] instance created successfully");
      try {
        await evolution.setWebhook(instanceName, webhookUrl, WEBHOOK_EVENTS);
        console.log("[whatsapp/connect] webhook registered:", webhookUrl);
      } catch (we) {
        console.warn(
          "[whatsapp/connect] setWebhook failed (non-fatal):",
          we instanceof Error ? we.message : we,
        );
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
        /\b403\b/.test(msg) ||
        /already\s+exist/i.test(msg) ||
        /already\s+in\s+use/i.test(msg) ||
        /\bduplicate\b/i.test(msg);

      if (!alreadyExists) throw e;

      console.log("[whatsapp/connect] instance already exists — checking current state");

      // If instance is already open (connected), sync profile and return immediately
      try {
        const statusRes = await evolution.getInstanceStatus(instanceName);
        const { mapConnectionState } = await import("@/lib/evolution/client");
        const { connected } = mapConnectionState(statusRes);
        if (connected) {
          console.log("[whatsapp/connect] instance is open — syncing profile and returning connected");
          const connectedPatch = slot === "secondary"
            ? { whatsapp_secondary_instance_id: instanceName, whatsapp_secondary_connected: true }
            : { whatsapp_instance_id: instanceName, whatsapp_connected: true };
          await supabase.from("profiles").update(connectedPatch).eq("id", user.id);
          return NextResponse.json({ instanceName, slot, connected: true });
        }
      } catch { /* status check failed, fall through to QR path */ }

      try {
        await evolution.setWebhook(instanceName, webhookUrl, WEBHOOK_EVENTS);
      } catch (we) {
        console.warn(
          "[whatsapp/connect] setWebhook failed (non-fatal):",
          we instanceof Error ? we.message : we,
        );
      }
    }

    // --- Pairing code path (no QR needed, user enters code in WhatsApp) ---
    if (phoneNumber) {
      const profilePatch =
        slot === "secondary"
          ? { whatsapp_secondary_instance_id: instanceName, whatsapp_secondary_connected: false }
          : { whatsapp_instance_id: instanceName, whatsapp_connected: false, whatsapp_owner_lid: null, whatsapp_lid_pending: true };

      const { error: profileErr } = await supabase.from("profiles").update(profilePatch).eq("id", user.id);
      if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

      const admin = createSupabaseAdminClient();
      await mergeWaSession(admin, user.id, instanceName, { owner_jid: null, owner_lid: null, lid_pending: true });

      // Delete any existing instance and recreate with qrcode:false.
      // This is the key fix: creating with qrcode:true locks Baileys into QR mode,
      // causing GET /instance/connect?number= to always return pairingCode:null.
      // With qrcode:false, Baileys starts in pairing mode and returns the code immediately.
      try {
        await evolution.deleteInstance(instanceName);
        console.log("[whatsapp/connect] deleted existing instance");
      } catch {
        /* ignore if doesn't exist */
      }
      try {
        await evolution.createInstance(instanceName, webhookUrl, { qrcode: false });
        console.log("[whatsapp/connect] created pairing instance (qrcode:false)");
      } catch (createErr) {
        const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
        if (!/token already|already\s+exist/i.test(createMsg)) throw createErr;
        // Delete didn't fully take — instance persists; proceed to request pairing code from it
        console.log("[whatsapp/connect] instance persisted after delete — requesting pairing code from existing instance");
      }
      try {
        await evolution.setWebhook(instanceName, webhookUrl, WEBHOOK_EVENTS);
      } catch (we) {
        console.warn("[whatsapp/connect] setWebhook non-fatal:", we instanceof Error ? we.message : we);
      }
      // Brief pause for the instance to register before requesting pairing code
      await new Promise((r) => setTimeout(r, 1000));
      console.log("[whatsapp/connect] requesting pairing code");

      const pairingRes = await evolution.getPairingCode(instanceName, phoneNumber);
      const pairingCode = extractPairingCode(pairingRes);
      console.log("[whatsapp/connect] pairing code:", pairingCode ? "obtained" : "not found", "| raw:", JSON.stringify(pairingRes).slice(0, 120));

      if (!pairingCode) {
        const raw = pairingRes as Record<string, unknown> | null;
        const detail = raw?._error ? `Error: ${raw._error}` : `Response: ${JSON.stringify(raw).slice(0, 300)}`;
        return NextResponse.json(
          { error: `Could not get pairing code. ${detail}` },
          { status: 500 },
        );
      }

      return NextResponse.json({ instanceName, slot, pairingCode });
    }

    // --- QR code path ---
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

        if (/404|not found|does not exist/i.test(msg)) {
          console.log("[whatsapp/connect] Broken instance detected — deleting and recreating");
          try {
            await evolution.deleteInstance(instanceName);
          } catch {
            /* ignore */
          }
          try {
            created = await createFresh();
            qr = await resolveQrDataUrl(created);
            if (!qr) {
              const connect2 = await evolution.getQRCode(instanceName);
              qr = await resolveQrDataUrl(connect2, created);
            }
          } catch (recreateErr) {
            const recreateMsg = recreateErr instanceof Error ? recreateErr.message : String(recreateErr);
            if (!/token already|already\s+exist/i.test(recreateMsg)) throw recreateErr;
            // Instance persisted after delete — fetch QR from existing instance
            console.log("[whatsapp/connect] instance persisted after delete — fetching QR from existing instance");
            try {
              const connect2 = await evolution.getQRCode(instanceName);
              qr = await resolveQrDataUrl(connect2);
            } catch { /* QR fetch failed, qr stays null */ }
          }
        }
      }
    }

    console.log("[whatsapp/connect] QR resolved:", qr ? "yes" : "no");

    const profilePatch =
      slot === "secondary"
        ? {
            whatsapp_secondary_instance_id: instanceName,
            whatsapp_secondary_connected: false,
          }
        : {
            whatsapp_instance_id: instanceName,
            whatsapp_connected: false,
            whatsapp_owner_lid: null,
            whatsapp_lid_pending: true,
          };

    const { error: profileErr } = await supabase
      .from("profiles")
      .update(profilePatch)
      .eq("id", user.id);

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const admin = createSupabaseAdminClient();
    await mergeWaSession(admin, user.id, instanceName, {
      owner_jid: null,
      owner_lid: null,
      lid_pending: true,
    });

    return NextResponse.json({
      instanceName,
      slot,
      qrCodeBase64: qr,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Connect failed";
    console.error("[whatsapp/connect] handler failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
