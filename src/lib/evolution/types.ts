/** Evolution API v1.x (atendai/evolution-api) — request/response shapes (best-effort; API may vary slightly by version). */

export interface CreateInstanceBody {
  instanceName: string;
  token?: string;
  qrcode?: boolean;
  integration?: string;
  /** Evolution v1: webhook URL passed at create time (no separate set endpoint) */
  webhook?: string;
  webhook_by_events?: boolean;
  events?: string[];
}

export interface CreateInstanceResponse {
  instance?: {
    instanceName?: string;
    status?: string;
    qrcode?: { base64?: string } | string;
  };
  qrcode?: { base64?: string };
  base64?: string;
  /** Some versions nest QR under `qrcode` string */
  [key: string]: unknown;
}

export interface InstanceStatusResponse {
  instance?: {
    instanceName?: string;
    state?: string;
  };
  state?: string;
  /** connection state payload */
  [key: string]: unknown;
}

export interface QRCodeResponse {
  base64?: string;
  qrcode?: { base64?: string } | string;
  code?: string;
  [key: string]: unknown;
}

export interface SendTextBody {
  number: string;
  /** Evolution v2: top-level text field */
  text?: string;
  /** Evolution v1 fallback: nested textMessage */
  textMessage?: {
    text: string;
  };
}

export interface SendMessageResponse {
  key?: { id?: string };
  [key: string]: unknown;
}

export interface SetWebhookBody {
  /** Evolution v1.x requires enabled:true or the request is rejected */
  enabled?: boolean;
  url: string;
  webhook_by_events?: boolean;
  webhook_base64?: boolean;
  events: string[];
  [key: string]: unknown;
}

/** Webhook POST body (subset we care about) */
export interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  /** Owner JID of the connected WhatsApp number, e.g. "17372969713@s.whatsapp.net" */
  sender?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface MessagesUpsertData {
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
  };
  message?: Record<string, unknown>;
  messageTimestamp?: string | number;
  [key: string]: unknown;
}

export interface ConnectionUpdateData {
  state?: string;
  status?: string;
  [key: string]: unknown;
}
