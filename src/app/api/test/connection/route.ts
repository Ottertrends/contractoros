import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { createEvolutionClient } from "@/lib/evolution/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evolutionInstanceName,
  evolutionSecondaryInstanceName,
} from "@/lib/whatsapp/instance-name";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/agent/model";

export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  message: string;
  detail?: string;
}

async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false, message: "ANTHROPIC_API_KEY not set" };
  try {
    const client = new Anthropic({ apiKey: key });
    const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
    const res = await client.messages.create({
      model,
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with just: OK" }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { ok: true, message: `Claude responded (model: ${model})`, detail: text };
  } catch (e) {
    return {
      ok: false,
      message: "Anthropic API call failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkEvolution(instanceName: string): Promise<CheckResult> {
  const url = process.env.EVOLUTION_API_URL?.trim();
  const key = process.env.EVOLUTION_API_KEY?.trim() || process.env.EVOLUTION_GLOBAL_API_KEY?.trim();
  if (!url) return { ok: false, message: "EVOLUTION_API_URL not set" };
  if (!key) return { ok: false, message: "EVOLUTION_API_KEY not set" };
  try {
    const client = createEvolutionClient();
    const status = await client.getInstanceStatus(instanceName);
    const state =
      (status as Record<string, unknown>)?.instance &&
      typeof (status as Record<string, unknown>).instance === "object"
        ? ((status as Record<string, { state?: string }>).instance?.state ?? "unknown")
        : "unknown";
    return {
      ok: true,
      message: `Evolution API reachable — instance state: ${state}`,
      detail: JSON.stringify(status).slice(0, 200),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If the instance just doesn't exist yet, API itself is reachable
    if (/404|not found|doesn.*exist/i.test(msg)) {
      return { ok: true, message: "Evolution API reachable (instance not yet created)", detail: msg };
    }
    return { ok: false, message: "Evolution API unreachable", detail: msg };
  }
}

async function checkSupabase(userId: string): Promise<CheckResult> {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!svcKey) return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY not set" };
  try {
    const admin = createSupabaseAdminClient();
    const { count, error } = await admin
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true, message: `Supabase admin client OK — ${count ?? 0} project(s)` };
  } catch (e) {
    return {
      ok: false,
      message: "Supabase admin client failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

function checkWebhookUrl(): CheckResult {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return { ok: false, message: "NEXT_PUBLIC_APP_URL not set" };
  if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
    return {
      ok: false,
      message: "NEXT_PUBLIC_APP_URL is localhost — Evolution cannot reach it",
      detail: `Current value: ${appUrl}`,
    };
  }
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/evolution`;
  return { ok: true, message: `Webhook URL: ${webhookUrl}` };
}

/** User-facing reminders when Claude is OK but WhatsApp bot seems silent */
function buildWhatsappHints(): string[] {
  const hints: string[] = [];
  if (process.env.EVOLUTION_WEBHOOK_SECRET?.trim()) {
    hints.push(
      "Webhook secret is configured: Evolution must send the same value in header x-evolution-webhook-secret or x-webhook-secret on every POST, or events are ignored (no bot).",
    );
  }
  hints.push(
    "The bot only activates on self-chat: message your own WhatsApp number (same device). Messages to customers or inbound-only chats are ignored by design.",
  );
  hints.push(
    "Second line: connect “Line 2” in Settings, scan with the other phone, then self-chat on that WhatsApp account. Instance name is user_<yourUserId>_2.",
  );
  hints.push(
    "Use Resync Webhook after changing domain or env. Profile phone should match your WhatsApp number if Evolution omits sender on webhooks.",
  );
  return hints;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "whatsapp_instance_id, whatsapp_secondary_instance_id, whatsapp_connected, whatsapp_secondary_connected",
    )
    .eq("id", user.id)
    .single();

  const primaryName =
    (profile?.whatsapp_instance_id as string | null) ?? evolutionInstanceName(user.id);
  const secondaryName =
    (profile?.whatsapp_secondary_instance_id as string | null) ??
    evolutionSecondaryInstanceName(user.id);

  const [anthropic, evPrimary, evSecondary, db, webhook] = await Promise.all([
    checkAnthropic(),
    checkEvolution(primaryName),
    checkEvolution(secondaryName),
    checkSupabase(user.id),
    Promise.resolve(checkWebhookUrl()),
  ]);

  const evolution =
    evPrimary.ok && evSecondary.ok
      ? {
          ok: true,
          message: `Evolution: primary + secondary instances OK (${primaryName}, ${secondaryName})`,
          detail: `${evPrimary.detail ?? ""} | ${evSecondary.detail ?? ""}`.trim(),
        }
      : !evPrimary.ok
        ? { ...evPrimary, message: `Primary (${primaryName}): ${evPrimary.message}` }
        : { ...evSecondary, message: `Secondary (${secondaryName}): ${evSecondary.message}` };

  const allOk = anthropic.ok && evolution.ok && db.ok && webhook.ok;

  return NextResponse.json({
    ok: allOk,
    whatsapp_connected: !!profile?.whatsapp_connected,
    whatsapp_secondary_connected: !!profile?.whatsapp_secondary_connected,
    instance_name: primaryName,
    secondary_instance_name: secondaryName,
    checks: { anthropic, evolution, db, webhook },
    whatsapp_hints: buildWhatsappHints(),
  });
}
