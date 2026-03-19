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
  if (!raw) throw new Error("Missing EVOLUTION_API_URL");
  return raw.replace(/\/$/, "");
}

function getApiKey(): string {
  const key = process.env.EVOLUTION_API_KEY?.trim();
  if (!key) throw new Error("Missing EVOLUTION_API_KEY");
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
    throw new Error(`Evolution API ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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
}

export function createEvolutionClient(): EvolutionClient {
  return {
    async createInstance(instanceName: string, webhookUrl: string) {
      const body: CreateInstanceBody = {
        instanceName,
        token: getApiKey(),
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };
      const created = await evolutionFetch<CreateInstanceResponse>(
        "/instance/create",
        { method: "POST", body: JSON.stringify(body) },
      );
      const webhookBody: SetWebhookBody = {
        url: webhookUrl,
        webhook_by_events: false,
        events: [
          "MESSAGES_UPSERT",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
        ],
      };
      await evolutionFetch(
        `/webhook/set/${encodeURIComponent(instanceName)}`,
        { method: "PUT", body: JSON.stringify(webhookBody) },
      );
      return created;
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
      const digits = to.replace(/\D/g, "");
      const number =
        to.includes("@s.whatsapp.net") ? to : `${digits}@s.whatsapp.net`;
      const body: SendTextBody = {
        number,
        textMessage: { text: message },
      };
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
      await evolutionFetch(
        `/webhook/set/${encodeURIComponent(instanceName)}`,
        { method: "PUT", body: JSON.stringify(body) },
      );
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
