"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoginForm } from "@/components/auth/login-form";

const features = [
  {
    icon: "💬",
    title: "WhatsApp AI Assistant",
    desc: "Text your job details and your AI replies instantly — drafts invoices, looks up material prices, and tracks projects. No app switching needed.",
  },
  {
    icon: "🧾",
    title: "Professional Invoices",
    desc: "Create and send invoices in seconds. Track what's paid, pending, and outstanding — all in one clean view.",
  },
  {
    icon: "📋",
    title: "Project & Client Tracking",
    desc: "Keep every job, client, and update organized without the paperwork. Know exactly where each project stands.",
  },
];

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Logo + brand */}
          <div className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="WorkSupp" width={48} height={48} className="object-contain" />
            <span className="text-lg font-bold text-primary dark:text-white tracking-tight">WorkSupp</span>
          </div>

          {/* CTA buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              Get Started Free
            </a>
            <button
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Sign In Modal */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to WorkSupp</DialogTitle>
          </DialogHeader>
          <LoginForm />
        </DialogContent>
      </Dialog>

      {/* Main content — single centered column */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-14 flex flex-col gap-14">
        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-5">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 text-sm font-medium px-3 py-1 rounded-full">
            <span>🤖</span> AI-powered for contractors
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight max-w-2xl">
            Run your business from your phone
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
            Track jobs, generate invoices, and get material prices — all through WhatsApp and a simple dashboard built for contractors.
          </p>
          <div className="flex items-center gap-3 flex-wrap justify-center mt-2">
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              Get Started Free
            </a>
            <button
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-3 bg-white dark:bg-slate-900 rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm"
            >
              <div className="text-3xl">{f.icon}</div>
              <div className="font-semibold text-slate-900 dark:text-white text-base">{f.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-400 dark:text-slate-500">
          Trusted by independent contractors · No setup fees · Cancel anytime
        </p>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
        Powered by{" "}
        <a
          href="https://otterq.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          OtterQ
        </a>
        {" "}· Built for the trades
      </footer>
    </div>
  );
}
