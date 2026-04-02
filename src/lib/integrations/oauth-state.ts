import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.INTEGRATIONS_OAUTH_STATE_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!s) throw new Error("INTEGRATIONS_OAUTH_STATE_SECRET or CRON_SECRET required for Google OAuth state");
  return s;
}

export function signGoogleOAuthState(userId: string): string {
  const exp = Date.now() + 15 * 60 * 1000;
  const payload = JSON.stringify({ uid: userId, exp });
  const h = createHmac("sha256", secret()).update(payload).digest("base64url");
  return Buffer.from(JSON.stringify({ p: payload, h }), "utf8").toString("base64url");
}

export function verifyGoogleOAuthState(token: string): string {
  let parsed: { p: string; h: string };
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { p: string; h: string };
  } catch {
    throw new Error("Invalid state");
  }
  const expected = createHmac("sha256", secret()).update(parsed.p).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.h);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  const inner = JSON.parse(parsed.p) as { uid: string; exp: number };
  if (typeof inner.uid !== "string" || typeof inner.exp !== "number") throw new Error("Invalid state payload");
  if (Date.now() > inner.exp) throw new Error("OAuth state expired");
  return inner.uid;
}
