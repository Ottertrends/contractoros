import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evolutionInstanceName } from "@/lib/whatsapp/instance-name";

export const dynamic = "force-dynamic";

/**
 * GET /api/test/send-diag
 * Diagnostic endpoint — tests the Evolution sendText call and returns the
 * RAW response (status + body) without throwing, so we can see the exact error.
 * Requires the user to be logged in.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, "");
  const apiKey =
    process.env.EVOLUTION_API_KEY?.trim() ||
    process.env.EVOLUTION_GLOBAL_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "EVOLUTION_API_URL or EVOLUTION_API_KEY not set" });
  }

  // Get instance name + profile phone
  const { data: profile } = await supabase
    .from("profiles")
    .select("whatsapp_instance_id, whatsapp_connected, phone")
    .eq("id", user.id)
    .single();

  const instanceName =
    (profile?.whatsapp_instance_id as string | null) ?? evolutionInstanceName(user.id);

  const phone = profile?.phone ?? null;
  const digits = phone ? String(phone).replace(/\D/g, "") : null;

  // 1. Check instance status (raw)
  const statusUrl = `${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
  let statusResult: unknown = null;
  let statusHttpCode: number | null = null;
  try {
    const r = await fetch(statusUrl, { headers: { apikey: apiKey } });
    statusHttpCode = r.status;
    const txt = await r.text();
    try { statusResult = JSON.parse(txt); } catch { statusResult = txt; }
  } catch (e) {
    statusResult = { fetchError: e instanceof Error ? e.message : String(e) };
  }

  // 2. Attempt sendText (raw — do NOT throw)
  let sendResult: unknown = null;
  let sendHttpCode: number | null = null;
  const sendTo = digits ?? "17372969713"; // fallback to known number if no profile phone
  const sendUrl = `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  const sendBody = {
    number: sendTo,
    text: "[WorkSup diagnostic test — please ignore]",
    textMessage: { text: "[WorkSup diagnostic test — please ignore]" },
  };

  try {
    const r = await fetch(sendUrl, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(sendBody),
    });
    sendHttpCode = r.status;
    const txt = await r.text();
    try { sendResult = JSON.parse(txt); } catch { sendResult = txt; }
  } catch (e) {
    sendResult = { fetchError: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    instanceName,
    whatsapp_connected_in_db: !!profile?.whatsapp_connected,
    profile_phone: phone,
    send_to_digits: sendTo,
    evolution_base_url: baseUrl,
    instance_status: { httpCode: statusHttpCode, body: statusResult },
    send_text: { httpCode: sendHttpCode, url: sendUrl, requestBody: sendBody, response: sendResult },
  });
}
