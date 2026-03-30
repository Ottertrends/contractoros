"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Slot = "primary" | "secondary";

type Props = {
  userId: string;
  primaryInitiallyConnected: boolean;
  secondaryInitiallyConnected: boolean;
};

export function WhatsAppConnection({
  userId: _userId,
  primaryInitiallyConnected,
  secondaryInitiallyConnected,
}: Props) {
  void _userId;

  return (
    <div className="flex flex-col gap-10">
      <LineBlock
        slot="primary"
        title="Primary WhatsApp line"
        description="Main number linked to your account."
        initiallyConnected={primaryInitiallyConnected}
      />
      <div className="border-t border-slate-200 dark:border-slate-800 pt-8">
        <LineBlock
          slot="secondary"
          title="Second WhatsApp line"
          description="Optional second number. Self-chat on that line to use the bot."
          initiallyConnected={secondaryInitiallyConnected}
        />
      </div>
    </div>
  );
}

function LineBlock({
  slot,
  title,
  description,
  initiallyConnected,
}: {
  slot: Slot;
  title: string;
  description: string;
  initiallyConnected: boolean;
}) {
  const router = useRouter();
  const [connected, setConnected] = React.useState(initiallyConnected);
  const [phone, setPhone] = React.useState<string | null>(null);

  // Pairing code state
  const [pairingMode, setPairingMode] = React.useState(false);
  const [pairingPhone, setPairingPhone] = React.useState("");
  const [pairingCode, setPairingCode] = React.useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = React.useState(false);
  const [pairingSecondsLeft, setPairingSecondsLeft] = React.useState<number | null>(null);
  const pairingTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    setConnected(initiallyConnected);
  }, [initiallyConnected]);

  React.useEffect(() => {
    if (initiallyConnected) void pollStatusOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiallyConnected, slot]);

  async function pollStatusOnce() {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (!res.ok) return;
      const body = (await res.json()) as {
        connected: boolean;
        phone?: string | null;
        secondary_connected?: boolean;
        secondary_phone?: string | null;
      };
      if (slot === "primary") {
        setConnected(body.connected);
        if (body.phone) setPhone(body.phone);
      } else {
        setConnected(!!body.secondary_connected);
        if (body.secondary_phone) setPhone(body.secondary_phone);
      }
    } catch {
      /* ignore */
    }
  }

  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pairingTimerRef.current) clearInterval(pairingTimerRef.current);
    };
  }, []);

  async function pollStatus() {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (!res.ok) return;
      const body = (await res.json()) as {
        connected: boolean;
        phone?: string | null;
        secondary_connected?: boolean;
        secondary_phone?: string | null;
      };
      if (slot === "primary") {
        setConnected(body.connected);
        if (body.phone) setPhone(body.phone);
        if (body.connected) stopPollingSuccess();
      } else {
        setConnected(!!body.secondary_connected);
        if (body.secondary_phone) setPhone(body.secondary_phone);
        if (body.secondary_connected) stopPollingSuccess();
      }
    } catch {
      /* ignore */
    }
  }

  function stopPollingSuccess() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pairingTimerRef.current) { clearInterval(pairingTimerRef.current); pairingTimerRef.current = null; }
    setQrDataUrl(null);
    setPairingCode(null);
    setPairingMode(false);
    setConnecting(false);
    toast.success(slot === "primary" ? "WhatsApp connected" : "Second line connected");
    router.refresh();
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    void pollStatus();
    pollRef.current = setInterval(() => void pollStatus(), 3000);
  }

  function normalizePairingPhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 10 ? digits : null;
  }

  function startPairingTimer() {
    if (pairingTimerRef.current) clearInterval(pairingTimerRef.current);
    setPairingSecondsLeft(60);
    pairingTimerRef.current = setInterval(() => {
      setPairingSecondsLeft((s) => {
        if (s === null || s <= 1) {
          clearInterval(pairingTimerRef.current!);
          pairingTimerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function onGetPairingCode() {
    const phone = normalizePairingPhone(pairingPhone);
    if (!phone) {
      toast.error("Enter a valid phone number (10+ digits with country code, e.g. 15551234567).");
      return;
    }
    setPairingLoading(true);
    setPairingCode(null);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          slot === "secondary" ? { slot: "secondary", phoneNumber: phone } : { phoneNumber: phone }
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to get pairing code");
      if (!body.pairingCode) throw new Error("No pairing code in response");
      setPairingCode(body.pairingCode as string);
      startPairingTimer();
      startPolling();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to get pairing code");
    } finally {
      setPairingLoading(false);
    }
  }

  async function onConnect() {
    setConnecting(true);
    setQrDataUrl(null);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slot === "secondary" ? { slot: "secondary" } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Connect failed");
      let qr = body.qrCodeBase64 as string | null;
      if (!qr) {
        const q = slot === "secondary" ? "?slot=secondary" : "";
        const qrRes = await fetch(`/api/whatsapp/qrcode${q}`);
        const qrBody = await qrRes.json();
        if (qrRes.ok && qrBody.qrCodeBase64)
          qr = qrBody.qrCodeBase64 as string;
      }
      if (qr) setQrDataUrl(qr);
      else
        toast.error(
          "No QR code returned. Check Evolution API logs and env (EVOLUTION_API_URL / KEY).",
        );
      startPolling();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Connect failed";
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  }

  async function onRefreshQr() {
    try {
      const q = slot === "secondary" ? "?slot=secondary" : "";
      const res = await fetch(`/api/whatsapp/qrcode${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "QR failed");
      if (body.qrCodeBase64) setQrDataUrl(body.qrCodeBase64);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "QR failed");
    }
  }

  async function onDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          slot === "secondary" ? { slot: "secondary" } : { slot: "primary" },
        ),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Disconnect failed");
      }
      setConnected(false);
      setPhone(null);
      setQrDataUrl(null);
      setPairingCode(null);
      setPairingMode(false);
      setConnecting(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (pairingTimerRef.current) { clearInterval(pairingTimerRef.current); pairingTimerRef.current = null; }
      toast.success(
        slot === "primary" ? "Primary line disconnected" : "Second line disconnected",
      );
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
      setDisconnectOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="neutral">Not connected</Badge>
        )}
        {phone ? (
          <span className="text-sm text-slate-700 dark:text-slate-200">
            Linked number: <strong>{phone}</strong>
          </span>
        ) : null}
      </div>

      {!connected ? (
        <div className="flex flex-col gap-3">
          {/* Primary action row — shown only in QR mode (not pairing mode) */}
          {!pairingMode ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void onConnect()}
                disabled={connecting}
              >
                {connecting ? "Starting…" : slot === "primary" ? "Connect WhatsApp" : "Connect second line"}
              </Button>
              {qrDataUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void onRefreshQr()}
                >
                  Refresh QR
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Back to QR link — shown only in pairing mode */}
          {pairingMode ? (
            <button
              type="button"
              className="text-xs text-slate-500 underline underline-offset-2 w-fit hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              onClick={() => { setPairingMode(false); setPairingCode(null); }}
            >
              ← Back to QR code
            </button>
          ) : null}

          {/* Pairing code: phone input */}
          {pairingMode && !pairingCode ? (
            <div className="flex flex-col gap-2 max-w-sm">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Your WhatsApp number — include <strong>+</strong> and country code
              </label>
              <p className="text-xs text-slate-400">e.g. +17372969713 (US) or +521234567890 (MX)</p>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="+17372969713"
                  value={pairingPhone}
                  onChange={(e) => setPairingPhone(e.target.value)}
                  disabled={pairingLoading}
                  className="max-w-[200px]"
                />
                <Button
                  type="button"
                  onClick={() => void onGetPairingCode()}
                  disabled={pairingLoading || normalizePairingPhone(pairingPhone) === null}
                >
                  {pairingLoading ? "Getting…" : "Get Code"}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Pairing code: display */}
          {pairingMode && pairingCode ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Your pairing code</p>
              <div className="flex items-center gap-3">
                <span className="text-4xl font-mono font-bold tracking-widest text-slate-900 dark:text-slate-100 select-all">
                  {pairingCode}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(pairingCode);
                    toast.success("Code copied");
                  }}
                >
                  Copy
                </Button>
              </div>
              {pairingSecondsLeft !== null && pairingSecondsLeft > 0 ? (
                <p className="text-xs text-slate-500">Expires in {pairingSecondsLeft}s</p>
              ) : pairingSecondsLeft === 0 ? (
                <p className="text-xs text-red-500 font-medium">Code expired — get a new one</p>
              ) : null}
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center leading-relaxed">
                Open WhatsApp → Settings → Linked Devices → Link with phone number → enter this code
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setPairingCode(null); setPairingSecondsLeft(null); }}
              >
                Get a new code
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* QR code display (only in QR mode) */}
      {qrDataUrl && !connected && !pairingMode ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="WhatsApp QR code"
            className="max-w-[280px] w-full rounded-lg border border-slate-100"
          />
          <p className="text-sm text-slate-600 text-center">
            Scan with WhatsApp → Linked devices. Status checks every 3 seconds.
          </p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            WorkSupp may include Amazon affiliate links when recommending products.{" "}
            <span className="font-medium">As an Amazon Associate, WorkSupp earns from qualifying purchases.</span>
          </p>
          {/* Pairing code toggle — appears below QR after Connect is clicked */}
          <button
            type="button"
            className="text-xs text-slate-500 underline underline-offset-2 w-fit hover:text-slate-700 dark:hover:text-slate-300 transition-colors mt-1"
            onClick={() => { setPairingMode(true); setQrDataUrl(null); }}
          >
            Or use pairing code (same-device setup — no second device needed)
          </button>
        </div>
      ) : !connected && connecting && !pairingMode ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          Generating QR code…
        </div>
      ) : !connected && !qrDataUrl && !connecting && !pairingMode ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          {slot === "primary" ? (
            <>
              Click <strong>Connect WhatsApp</strong> to create your primary Evolution
              instance and show the QR code.
            </>
          ) : (
            <>
              Use <strong>Connect second line</strong> for your other WhatsApp number
              (separate Evolution instance).
            </>
          )}
        </div>
      ) : null}

      {connected ? (
        <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="danger">
              {slot === "primary" ? "Disconnect primary" : "Disconnect second line"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {slot === "primary"
                  ? "Disconnect primary WhatsApp?"
                  : "Disconnect second line?"}
              </DialogTitle>
              <DialogDescription>
                This logs out of Evolution for this line and deletes that instance.
                The other line (if any) stays connected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDisconnectOpen(false)}
                disabled={disconnecting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={disconnecting}
                onClick={() => void onDisconnect()}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
