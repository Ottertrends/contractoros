import QRCode from "qrcode";

import type {
  CreateInstanceBody,
  CreateInstanceResponse,
  InstanceStatusResponse,
  QRCodeResponse,
  SendMessageResponse,
  SendTextBody,
  SetWebhookBody,
} from "@/lib/evolution/types";

function getBaseUrl(): string {
  const raw = process.env.EVOLUTION_API_URL?.trim();
  if (!raw) {
    throw new Error(
      "Missing EVOLUTION_API_URL. Add it to .env.local (then restart `pnpm dev`) or Vercel → Environment Variables. Example: http://YOUR_VPS_IP:8080",
    );
  }
  return raw.replace(/\/$/, "");
}

/**
 * Global API key sent as the `apikey` header — must match Evolution’s configured auth key
 * (same value as in Evolution Manager / Docker `AUTHENTICATION_API_KEY`).
 */
function getApiKey(): string {
  const key =
    process.env.EVOLUTION_API_KEY?.trim() ||
    process.env.EVOLUTION_GLOBAL_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing EVOLUTION_API_KEY. Add to .env.local: EVOLUTION_API_KEY=your_global_key (restart dev server). On Vercel: Project → Settings → Environment Variables. Use the same API key as your Evolution API instance (often the value of AUTHENTICATION_API_KEY on the Evolution server).",
    );
  }
  return key;
}

async function evolutionFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: getApiKey(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    // Log with a unique tag so we can search for it in Vercel runtime logs
    console.error("[evolution-api-error]", "status:", res.status, "| path:", path, "| body:", text.slice(0, 600));
    throw new Error(`Evolution API ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface MediaBase64Response {
  base64: string;
  mimetype: string;
}

export interface EvolutionClient {
  createInstance(
    instanceName: string,
    webhookUrl: string,
  ): Promise<CreateInstanceResponse>;
  deleteInstance(instanceName: string): Promise<void>;
  getInstanceStatus(instanceName: string): Promise<InstanceStatusResponse>;
  getQRCode(instanceName: string): Promise<QRCodeResponse>;
  logoutInstance(instanceName: string): Promise<void>;
  sendText(
    instanceName: string,
    to: string,
    message: string,
  ): Promise<SendMessageResponse>;
  setWebhook(
    instanceName: string,
    webhookUrl: string,
    events: string[],
  ): Promise<void>;
  getMediaBase64(
    instanceName: string,
    messageData: unknown,
  ): Promise<MediaBase64Response>;
  getPairingCode(instanceName: string, phoneNumber: string): Promise<QRCodeResponse>;
}

export function createEvolutionClient(): EvolutionClient {
  return {
    async createInstance(instanceName: string, _webhookUrl: string) {
      // Evolution v2: minimal body only — extra fields (webhook, token, events)
      // cause strict-validation 400 errors on v2 and leave the instance in a broken state.
      // Webhook is always registered separately via setWebhook() after creation.
      const body: CreateInstanceBody = {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };
      return evolutionFetch<CreateInstanceResponse>(
        "/instance/create",
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    async deleteInstance(instanceName: string) {
      await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
      });
    },

    async getInstanceStatus(instanceName: string) {
      return evolutionFetch<InstanceStatusResponse>(
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET" },
      );
    },

    async getQRCode(instanceName: string) {
      return evolutionFetch<QRCodeResponse>(
        `/instance/connect/${encodeURIComponent(instanceName)}`,
        { method: "GET" },
      );
    },

    async logoutInstance(instanceName: string) {
      await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, {
        method: "DELETE",
      });
    },

    async sendText(instanceName: string, to: string, message: string) {
      // Strip to digits only — Evolution v2 wants bare number, v1 accepts it too
      const digits = to.replace(/\D/g, "");
      // Send both `text` (v2) and `textMessage` (v1) so the same payload works
      // regardless of which Evolution major version is running on the VPS.
      const body: SendTextBody = {
        number: digits,
        text: message,
        textMessage: { text: message },
      };
      console.log("[evolution-client] sendText →", `/message/sendText/${instanceName}`, "| to:", digits, "| preview:", message.slice(0, 60));
      return evolutionFetch<SendMessageResponse>(
        `/message/sendText/${encodeURIComponent(instanceName)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    async setWebhook(instanceName: string, webhookUrl: string, events: string[]) {
      const body: SetWebhookBody = {
        url: webhookUrl,
        webhook_by_events: false,
        events,
      };
      // Evolution v2 uses POST (not PUT) for webhook/set
      await evolutionFetch(
        `/webhook/set/${encodeURIComponent(instanceName)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    async getMediaBase64(instanceName: string, messageData: unknown) {
      const result = await evolutionFetch<MediaBase64Response>(
        `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
        { method: "POST", body: JSON.stringify({ message: messageData }) },
      );
      return result;
    },

    async getPairingCode(instanceName: string, phoneNumber: string) {
      const digits = phoneNumber.replace(/\D/g, "");
      // Evolution v1/v2.1: GET /instance/connect?number= returns pairingCode once socket is open.
      // Retry up to 10 times (5s total) — pairingCode is null until Baileys is fully in connecting state.
      let lastResult: QRCodeResponse | undefined;
      let lastError = "";
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const result = await evolutionFetch<QRCodeResponse>(
            `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(digits)}`,
            { method: "GET" },
          );
          console.log(`[evolution-client] getPairingCode attempt ${attempt}:`, JSON.stringify(result).slice(0, 300));
          const code = (result as Record<string, unknown>).pairingCode;
          if (typeof code === "string" && code.trim().length > 0) {
            return result;
          }
          lastResult = result;
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          console.warn(`[evolution-client] getPairingCode attempt ${attempt} error:`, lastError.slice(0, 200));
        }
        if (attempt < 10) await new Promise((r) => setTimeout(r, 500));
      }
      return { ...(lastResult ?? {}), _error: lastError || "pairingCode was null after 10 attempts" } as unknown as QRCodeResponse;
    },
  };
}

/** Extract base64 PNG/data URL from various Evolution connect/create responses */
export function extractQrBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.base64 === "string" && o.base64.length > 0) {
    return o.base64.startsWith("data:") ? o.base64 : `data:image/png;base64,${o.base64}`;
  }
  const qrcode = o.qrcode;
  if (typeof qrcode === "string" && qrcode.length > 0) {
    return qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`;
  }
  if (qrcode && typeof qrcode === "object" && "base64" in qrcode) {
    const b = (qrcode as { base64?: string }).base64;
    if (typeof b === "string" && b.length > 0) {
      return b.startsWith("data:") ? b : `data:image/png;base64,${b}`;
    }
  }
  const instance = o.instance;
  if (instance && typeof instance === "object" && "qrcode" in instance) {
    return extractQrBase64((instance as { qrcode: unknown }).qrcode);
  }
  return null;
}

/**
 * Evolution v1 `/instance/connect` returns `{ code, pairingCode, count }` — `code` is the
 * WhatsApp Web session string and must be turned into a QR image (not raw base64 PNG).
 */
export function extractWhatsAppQrString(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;

  const tryCode = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    // Pairing codes are short; QR payloads are long (typ. 100+ chars)
    if (s.length < 24) return null;
    return s;
  };

  const direct = tryCode(o.code);
  if (direct) return direct;

  const qrcode = o.qrcode;
  if (qrcode && typeof qrcode === "object") {
    const nested = tryCode((qrcode as { code?: unknown }).code);
    if (nested) return nested;
  }

  const instance = o.instance;
  if (instance && typeof instance === "object") {
    const inst = instance as Record<string, unknown>;
    const fromInst = tryCode(inst.code);
    if (fromInst) return fromInst;
    if (inst.qrcode && typeof inst.qrcode === "object") {
      const nested = tryCode((inst.qrcode as { code?: unknown }).code);
      if (nested) return nested;
    }
  }

  return null;
}

/** Prefer base64 from API; otherwise render Evolution's `code` field as a QR data URL. */
export async function resolveQrDataUrl(
  ...sources: unknown[]
): Promise<string | null> {
  for (const src of sources) {
    const fromB64 = extractQrBase64(src);
    if (fromB64) return fromB64;
  }
  for (const src of sources) {
    const raw = extractWhatsAppQrString(src);
    if (!raw) continue;
    try {
      return await QRCode.toDataURL(raw, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Extract the pairing code from an Evolution connect response when a phone number
 * was supplied. Evolution may return it as `pairingCode` (v2) or `code` (v1, short).
 * Logs the raw payload so we can debug format differences.
 */
export function extractPairingCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;

  console.log("[evolution-client] extractPairingCode raw payload:", JSON.stringify(o).slice(0, 500));

  // v2: explicit pairingCode field
  if (typeof o.pairingCode === "string" && o.pairingCode.trim().length > 0) {
    return o.pairingCode.trim().toUpperCase();
  }

  // v1 / fallback: `code` field that is short (pairing codes are ≤ 16 chars)
  if (typeof o.code === "string" && o.code.trim().length > 0 && o.code.trim().length <= 16) {
    return o.code.trim().toUpperCase();
  }

  // Nested under `instance` key — check both pairingCode and short code
  if (o.instance && typeof o.instance === "object") {
    const inst = o.instance as Record<string, unknown>;
    if (typeof inst.pairingCode === "string" && inst.pairingCode.trim().length > 0) {
      return inst.pairingCode.trim().toUpperCase();
    }
    if (typeof inst.code === "string" && inst.code.trim().length > 0 && inst.code.trim().length <= 16) {
      return inst.code.trim().toUpperCase();
    }
  }

  return null;
}

/** Map Evolution connection payload to open | close | connecting */
export function mapConnectionState(payload: unknown): {
  status: "open" | "close" | "connecting";
  connected: boolean;
} {
  const raw =
    (payload &&
      typeof payload === "object" &&
      "instance" in payload &&
      (payload as { instance?: { state?: string } }).instance?.state) ||
    (payload && typeof payload === "object" && "state" in payload
      ? String((payload as { state?: string }).state)
      : "") ||
    (payload && typeof payload === "object" && "state" in (payload as object)
      ? ""
      : "");

  const str =
    String(raw).toLowerCase() ||
    JSON.stringify(payload ?? {}).toLowerCase();

  if (str.includes("open") || str === "connected") {
    return { status: "open", connected: true };
  }
  if (str.includes("connecting") || str.includes("qr")) {
    return { status: "connecting", connected: false };
  }
  return { status: "close", connected: false };
}
