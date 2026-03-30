"use client";

import * as React from "react";
import Link from "next/link";

const steps = [
  {
    title: "Welcome to WorkSupp!",
    subtitle: "Your AI-powered contractor assistant",
    content: (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-6xl">👷</div>
        <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed max-w-xs">
          WorkSupp helps you manage projects, draft invoices, save prices, and more — all through WhatsApp.
          It takes about 2 minutes to set up.
        </p>
      </div>
    ),
  },
  {
    title: "Connect your WhatsApp",
    subtitle: "Step 1 of 3",
    content: (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 flex flex-col gap-3">
          {[
            "Go to Settings → WhatsApp in the left menu.",
            "Click Connect WhatsApp or use the pairing code option.",
            "Follow the instructions to link your number.",
          ].map((s, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-300">{s}</p>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors self-start"
        >
          Go to Settings →
        </Link>
      </div>
    ),
  },
  {
    title: "Talk to your assistant",
    subtitle: "Step 2 of 3",
    content: (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-primary/10 dark:bg-primary/20 border border-primary/20 p-4 text-center">
          <p className="text-sm font-semibold text-primary dark:text-primary/90">
            Always start your message with <span className="font-mono text-lg">/</span>
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Open WhatsApp, message your own number, and type a command starting with /.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { cmd: "/nuevo trabajo Kitchen remodel", desc: "Start a new project" },
            { cmd: "/factura", desc: "Draft an invoice" },
            { cmd: "/save $12/sq ft for tile", desc: "Save a price" },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3">
              <code className="text-sm font-mono text-primary">{cmd}</code>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "What you can do",
    subtitle: "Step 3 of 3",
    content: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your WorkSupp assistant can help you with:
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {[
            { icon: "📁", text: "Create & manage projects" },
            { icon: "🧾", text: "Draft & download invoices" },
            { icon: "📸", text: "Save photos & notes" },
            { icon: "💰", text: "Look up material prices" },
            { icon: "👤", text: "Manage clients" },
            { icon: "🔍", text: "Web price search" },
            { icon: "📋", text: "Track job history" },
            { icon: "💼", text: "Price book management" },
          ].map(({ icon, text }) => (
            <li key={text} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg p-2">
              <span>{icon}</span> {text}
            </li>
          ))}
        </ul>
      </div>
    ),
  },
];

type Props = { show: boolean };

export function OnboardingGuide({ show }: Props) {
  const [visible, setVisible] = React.useState(show);
  const [step, setStep] = React.useState(0);
  const [completing, setCompleting] = React.useState(false);

  if (!visible) return null;

  async function complete() {
    if (completing) return;
    setCompleting(true);
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {
      /* ignore — modal still closes */
    }
    setVisible(false);
  }

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{current.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{current.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => void complete()}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2 mt-1 transition-colors"
          >
            Skip
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {current.content}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={() => (isLast ? void complete() : setStep((s) => s + 1))}
            disabled={completing}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isLast ? "Let's go!" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
