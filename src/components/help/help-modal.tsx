"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Tab = "how-to" | "contact";

type Props = {
  open: boolean;
  onClose: () => void;
  userName?: string;
  userEmail?: string;
};

export function HelpModal({ open, onClose, userName, userEmail }: Props) {
  const [tab, setTab] = React.useState<Tab>("how-to");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  function handleOpenChange(v: boolean) {
    if (!v) {
      onClose();
      // Reset contact form when closing
      setTimeout(() => { setTab("how-to"); setSent(false); setMessage(""); }, 300);
    }
  }

  async function onSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 10) {
      toast.error("Please write at least 10 characters.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Failed to send");
      }
      setSent(true);
      setMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  const commands = [
    { cmd: "/nuevo trabajo Kitchen remodel", desc: "Create a new project" },
    { cmd: "/factura", desc: "Draft an invoice for the current project" },
    { cmd: "/save $12/sq ft for tile", desc: "Save a price or note" },
    { cmd: "/projects", desc: "List your projects" },
    { cmd: "/cliente John Smith", desc: "Save or look up a client" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 -mx-6 px-6 mb-4">
          {(["how-to", "contact"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t === "how-to" ? "How to Use" : "Contact Us"}
            </button>
          ))}
        </div>

        {tab === "how-to" ? (
          <div className="flex flex-col gap-5">
            {/* Key rule */}
            <div className="rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/20 p-4">
              <p className="text-sm font-semibold text-primary dark:text-primary/90 text-center">
                Always start your message with <span className="font-mono text-lg">/</span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 text-center mt-1">
                The bot only responds to messages that begin with a forward slash.
              </p>
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Getting started</h3>
              {[
                "Go to Settings → WhatsApp and connect your number.",
                "Open WhatsApp on your phone and message your own number.",
                "Type / before every command — the bot will respond.",
              ].map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{step}</p>
                </div>
              ))}
            </div>

            {/* Example commands */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Example commands</h3>
              <div className="flex flex-col gap-2">
                {commands.map(({ cmd, desc }) => (
                  <div key={cmd} className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3 flex flex-col gap-0.5">
                    <code className="text-sm font-mono text-primary">{cmd}</code>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* What you can do */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">What your assistant can do</h3>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                {[
                  "Create & manage projects",
                  "Draft and send invoices",
                  "Save photos & notes",
                  "Look up material prices",
                  "Manage clients",
                  "Search web for prices",
                  "Track job history",
                  "Download PDF invoices",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-emerald-500">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sent ? (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-6 text-center flex flex-col gap-2">
                <p className="text-2xl">✅</p>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">Message sent!</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {"We'll get back to you as soon as possible."}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2 self-center"
                  onClick={() => setSent(false)}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={(e) => void onSendMessage(e)} className="flex flex-col gap-4">
                {(userName || userEmail) && (
                  <p className="text-xs text-slate-500">
                    Sending as <strong>{userName ?? userEmail}</strong>
                    {userName && userEmail ? ` (${userEmail})` : ""}
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Your message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your question or issue..."
                    rows={5}
                    disabled={sending}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                  <p className="text-xs text-slate-400">{message.length} / 1000 characters</p>
                </div>
                <Button type="submit" disabled={sending || message.trim().length < 10}>
                  {sending ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
