"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoginForm } from "@/components/auth/login-form";

const features = [
  {
    icon: "💬",
    title: "WhatsApp AI",
    desc: "Text your job details — get invoices drafted and prices looked up instantly.",
  },
  {
    icon: "🧾",
    title: "Invoices",
    desc: "Create and send professional invoices in seconds. Track paid vs. outstanding.",
  },
  {
    icon: "📋",
    title: "Project Tracking",
    desc: "Every job, client, and update organized — no paperwork.",
  },
];

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    // h-dvh + overflow-hidden = no scroll on mobile; md: reverts to normal flow
    <div className="h-dvh overflow-hidden md:h-auto md:overflow-auto md:min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">

      {/* Nav */}
      <header className="shrink-0 sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between gap-3">
          {/* Logo + brand */}
          <div className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="WorkSupp" width={40} height={40} className="object-contain md:w-12 md:h-12" />
            <span className="text-base md:text-lg font-bold text-primary dark:text-white tracking-tight">WorkSupp</span>
          </div>

          {/* CTA buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 md:px-4 md:py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap
                bg-primary hover:bg-primary/90
                dark:bg-primary/20 dark:text-blue-300 dark:hover:bg-primary/30 dark:border dark:border-blue-400/30"
            >
              Get Started Free
            </a>
            <button
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 md:px-4 md:py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap"
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

      {/* Main — flex-1 + min-h-0 lets it compress to fill remaining viewport */}
      <main className="flex-1 min-h-0 w-full max-w-5xl mx-auto px-4 flex flex-col gap-3 py-4 md:gap-14 md:py-14">

        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-2 md:gap-5 shrink-0">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 text-xs md:text-sm font-medium px-3 py-1 rounded-full">
            <span>🤖</span> AI-powered for contractors
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight max-w-2xl">
            Run your business from your phone
          </h1>
          <p className="text-sm md:text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
            Track jobs, generate invoices, and get material prices — all through WhatsApp and a simple dashboard built for contractors.
          </p>
        </div>

        {/* Feature cards — 3 cols on all sizes, compact on mobile */}
        <div className="grid grid-cols-3 gap-2 md:gap-5 flex-1 min-h-0">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-1 md:gap-3 bg-white dark:bg-slate-900 rounded-xl p-3 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              <div className="text-xl md:text-3xl shrink-0">{f.icon}</div>
              <div className="font-semibold text-slate-900 dark:text-white text-xs md:text-base leading-tight">{f.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug hidden sm:block md:block">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Tagline — hidden on mobile to save space */}
        <p className="hidden md:block text-center text-sm text-slate-400 dark:text-slate-500 shrink-0">
          Trusted by independent contractors · No setup fees · Cancel anytime
        </p>
      </main>

      {/* Footer — hidden on mobile */}
      <footer className="hidden md:block shrink-0 py-6 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
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
