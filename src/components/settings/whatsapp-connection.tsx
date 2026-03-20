"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  userId: string;
  initiallyConnected: boolean;
  initialPhone: string | null;
};

export function WhatsAppConnection({
  userId: _userId,
  initiallyConnected,
  initialPhone,
}: Props) {
  const router = useRouter();
  void _userId;

  const [connected, setConnected] = React.useState(initiallyConnected);
  const [phone, setPhone] = React.useState(initialPhone);

  React.useEffect(() => {
    if (initiallyConnected) void pollStatusOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiallyConnected]);

  async function pollStatusOnce() {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (!res.ok) return;
      const body = (await res.json()) as {
        connected: boolean;
        phone?: string | null;
      };
      setConnected(body.connected);
      if (body.phone) setPhone(body.phone);
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
    };
  }, []);

  async function pollStatus() {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (!res.ok) return;
      const body = (await res.json()) as {
        connected: boolean;
        phone?: string | null;
      };
      setConnected(body.connected);
      if (body.phone) setPhone(body.phone);
      if (body.connected) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setQrDataUrl(null);
        setConnecting(false);
        toast.success("WhatsApp connected");
        router.refresh();
      }
    } catch {
      /* ignore */
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    void pollStatus();
    pollRef.current = setInterval(() => void pollStatus(), 3000);
  }

  async function onConnect() {
    setConnecting(true);
    setQrDataUrl(null);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Connect failed");
      let qr = body.qrCodeBase64 as string | null;
      if (!qr) {
        const qrRes = await fetch("/api/whatsapp/qrcode");
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
      const res = await fetch("/api/whatsapp/qrcode");
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
      const res = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Disconnect failed");
      }
      setConnected(false);
      setPhone(null);
      setQrDataUrl(null);
      setConnecting(false);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      toast.success("WhatsApp disconnected");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
      setDisconnectOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="neutral">Not Connected</Badge>
        )}
        {phone ? (
          <span className="text-sm text-slate-700 dark:text-slate-200">
            Linked number: <strong>{phone}</strong>
          </span>
        ) : null}
      </div>

      {!connected ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void onConnect()}
            disabled={connecting}
          >
            {connecting ? "Starting…" : "Connect WhatsApp"}
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

      {qrDataUrl && !connected ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="WhatsApp QR code"
            className="max-w-[280px] w-full rounded-lg border border-slate-100"
          />
          <p className="text-sm text-slate-600 text-center">
            Scan this QR code with WhatsApp → Linked devices. Status checks
            every 3 seconds.
          </p>
        </div>
      ) : !connected && connecting ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          Generating QR code…
        </div>
      ) : !connected && !qrDataUrl && !connecting ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          Click <strong>Connect WhatsApp</strong> to create your Evolution
          instance and show the QR code.
        </div>
      ) : null}

      {connected ? (
      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="danger">
            Disconnect
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect WhatsApp?</DialogTitle>
            <DialogDescription>
              This logs out of WhatsApp on Evolution and deletes your instance.
              You can reconnect anytime.
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
