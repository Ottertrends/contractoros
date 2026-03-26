import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function safePreview(value: string | undefined, keep = 8): string {
  if (!value) return "(missing)";
  if (value.length <= keep * 2) return value;
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

function parseJwtPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
    const json = Buffer.from(raw + pad, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anon) {
    return NextResponse.json(
      {
        ok: false,
        message: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
        urlPresent: !!url,
        anonPresent: !!anon,
      },
      { status: 500 },
    );
  }

  const payload = parseJwtPayload(anon);
  const role = typeof payload?.role === "string" ? payload.role : null;
  const aud = typeof payload?.aud === "string" ? payload.aud : null;
  const iss = typeof payload?.iss === "string" ? payload.iss : null;

  const authBase = `${url.replace(/\/$/, "")}/auth/v1`;

  try {
    const res = await fetch(`${authBase}/settings`, {
      method: "GET",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      cache: "no-store",
    });

    const bodyText = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      supabaseUrlPreview: safePreview(url, 20),
      anonKeyPreview: safePreview(anon, 12),
      anonClaims: { role, aud, iss },
      endpoint: `${authBase}/settings`,
      bodyPreview: bodyText.slice(0, 500),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        message: "Failed to reach Supabase Auth endpoint",
        supabaseUrlPreview: safePreview(url, 20),
        anonKeyPreview: safePreview(anon, 12),
        anonClaims: { role, aud, iss },
        endpoint: `${authBase}/settings`,
        errorType: Object.prototype.toString.call(e),
        errorMessage: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

