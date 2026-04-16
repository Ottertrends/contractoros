"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoginForm } from "@/components/auth/login-form";

// ── useInView hook ─────────────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

// ── Feature cards ─────────────────────────────────────────────────────────────
const features = [
  {
    icon: "💬",
    title: "WhatsApp AI",
    desc: "Text your job details and get invoices drafted, material prices looked up, and clients messaged — without opening an app.",
  },
  {
    icon: "🧾",
    title: "Invoices + Payments",
    desc: "Create, send, and collect payment via Stripe in seconds. Track paid, outstanding, and draft invoices in one view.",
  },
  {
    icon: "📋",
    title: "Projects & Clients",
    desc: "Every job, client, and status organized automatically. No spreadsheets, no paperwork.",
  },
  {
    icon: "📅",
    title: "Calendar & Reminders",
    desc: "Set recurring job schedules and get a WhatsApp reminder the day before every job — so nothing slips through.",
  },
  {
    icon: "📄",
    title: "AI Proposals",
    desc: "Generate a professional PDF quote from your project data in one click. Send a share link or download it.",
  },
  {
    icon: "👥",
    title: "Team Access",
    desc: "Add a team member on the Premium Team plan. Everyone stays in sync without extra apps or group chats.",
  },
];

// ── How it works ──────────────────────────────────────────────────────────────
const steps = [
  { num: "01", title: "Text your job", desc: "WhatsApp your AI assistant with job details, client info, or a question about material prices." },
  { num: "02", title: "AI does the work", desc: "Invoices get drafted, proposals generated, and jobs logged — all from a single message." },
  { num: "03", title: "Get paid faster", desc: "Send a Stripe payment link, share a proposal, or mark a job done. Everything tracked in one dashboard." },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);

  const featuresRef = useInView(0.1);
  const stepsRef    = useInView(0.1);
  const ctaRef      = useInView(0.15);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col overflow-x-hidden">

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <header className="shrink-0 sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="WorkSupp" width={36} height={36} className="object-contain sm:w-10 sm:h-10" />
            <span className="text-base sm:text-lg font-bold text-primary dark:text-white tracking-tight">WorkSupp</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/pricing"
              className="hidden sm:inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              Pricing
            </a>
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 dark:bg-primary/20 dark:text-blue-300 dark:hover:bg-primary/30 dark:border dark:border-blue-400/30 transition-colors whitespace-nowrap"
            >
              Get Started Free
            </a>
            <button
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      {/* ── Login Modal ────────────────────────────────────────────────────── */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to WorkSupp</DialogTitle>
          </DialogHeader>
          <LoginForm />
        </DialogContent>
      </Dialog>

      <main className="flex-1 flex flex-col items-center w-full">

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="relative w-full flex flex-col items-center text-center px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20 overflow-hidden">

          {/* Animated background blobs */}
          <div
            className="absolute -top-20 -left-20 w-72 h-72 sm:w-96 sm:h-96 rounded-full opacity-[0.07] dark:opacity-[0.05]"
            style={{
              background: "radial-gradient(circle, #1e293b 0%, transparent 70%)",
              animation: "floatBlob 14s ease-in-out infinite",
            }}
          />
          <div
            className="absolute -bottom-10 -right-10 w-64 h-64 sm:w-80 sm:h-80 rounded-full opacity-[0.06] dark:opacity-[0.04]"
            style={{
              background: "radial-gradient(circle, #0d9488 0%, transparent 70%)",
              animation: "floatBlob 18s ease-in-out infinite reverse",
            }}
          />

          <div className="relative z-10 max-w-2xl flex flex-col items-center gap-4 sm:gap-6">
            {/* Badge */}
            <span
              className="anim-fade-up inline-flex items-center gap-1.5 bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-full"
              style={{ animationDelay: "0.05s" }}
            >
              ⚡ Built for the trades
            </span>

            {/* Headline */}
            <h1
              className="anim-fade-up text-4xl sm:text-6xl font-bold text-slate-900 dark:text-white leading-[1.08] tracking-tight"
              style={{ animationDelay: "0.15s" }}
            >
              Run your contracting<br className="hidden sm:block" /> business{" "}
              <span className="text-accent">on autopilot</span>
            </h1>

            {/* Subtext */}
            <p
              className="anim-fade-up text-sm sm:text-lg text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed"
              style={{ animationDelay: "0.25s" }}
            >
              WhatsApp AI + invoices + scheduling — everything a contractor needs, from your phone.
            </p>

            {/* CTAs */}
            <div
              className="anim-fade-up flex flex-col sm:flex-row items-center gap-3"
              style={{ animationDelay: "0.35s" }}
            >
              <a
                href="/auth/signup"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-white bg-primary hover:bg-primary/90 dark:bg-primary/20 dark:text-blue-200 dark:hover:bg-primary/30 dark:border dark:border-blue-400/30 transition-all shadow-sm hover:shadow-md"
              >
                Get Started Free →
              </a>
              <a
                href="/pricing"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm"
              >
                See Pricing
              </a>
            </div>

            {/* Trust */}
            <p
              className="anim-fade-in text-xs text-slate-400 dark:text-slate-600"
              style={{ animationDelay: "0.5s" }}
            >
              No setup fees · No credit card required · Cancel anytime
            </p>
          </div>
        </section>

        {/* ── Feature Grid ───────────────────────────────────────────────── */}
        <section className="w-full max-w-5xl px-4 sm:px-6 pb-16 sm:pb-20">
          <div
            ref={featuresRef.ref}
            className="text-center mb-8 sm:mb-12 reveal-card"
            style={featuresRef.visible ? { transitionDelay: "0s" } : {}}
          >
            <h2
              className={`text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white ${featuresRef.visible ? "visible" : ""}`}
            >
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-xl mx-auto">
              WorkSupp replaces the clipboard, the spreadsheet, and the guesswork.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {features.map((f, i) => (
              <FeatureCard key={f.title} feature={f} delay={i * 80} />
            ))}
          </div>
        </section>

        {/* ── How It Works ───────────────────────────────────────────────── */}
        <section className="w-full bg-white dark:bg-slate-900 border-t border-b border-slate-200 dark:border-slate-800 py-14 sm:py-20 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div
              ref={stepsRef.ref}
              className={`text-center mb-10 sm:mb-14 reveal-card ${stepsRef.visible ? "visible" : ""}`}
            >
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                How it works
              </h2>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2">
                Three steps. That&apos;s it.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              {steps.map((step, i) => (
                <StepCard key={step.num} step={step} delay={i * 100} parentVisible={stepsRef.visible} />
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ─────────────────────────────────────────────────── */}
        <section className="w-full px-4 sm:px-6 py-16 sm:py-24">
          <div
            ref={ctaRef.ref}
            className={`max-w-3xl mx-auto rounded-2xl sm:rounded-3xl bg-primary dark:bg-slate-800 px-6 sm:px-12 py-10 sm:py-14 text-center reveal-card ${ctaRef.visible ? "visible" : ""}`}
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-white leading-snug">
              Stop losing jobs to disorganization.
            </h2>
            <p className="text-sm sm:text-base text-slate-300 mt-3 mb-7 max-w-lg mx-auto leading-relaxed">
              WorkSupp handles the paperwork so you can focus on the work. Start free today.
            </p>
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-sm font-semibold text-primary bg-white hover:bg-slate-100 transition-all shadow-sm hover:shadow-md"
            >
              Create your free account →
            </a>
          </div>
        </section>

      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 py-5 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
        Powered by{" "}
        <a href="https://otterq.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          OtterQ
        </a>
        {" "}· Built for the trades ·{" "}
        <a href="/privacy-policy" className="text-primary hover:underline">
          Privacy Policy
        </a>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCard({ feature, delay }: { feature: typeof features[0]; delay: number }) {
  const { ref, visible } = useInView(0.1);
  return (
    <div
      ref={ref}
      className={`reveal-card flex flex-row sm:flex-col items-start gap-3 sm:gap-4 bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow ${visible ? "visible" : ""}`}
      style={visible ? { transitionDelay: `${delay}ms` } : {}}
    >
      <div className="text-2xl sm:text-3xl shrink-0">{feature.icon}</div>
      <div className="flex flex-col gap-0.5 sm:gap-1.5">
        <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">{feature.title}</div>
        <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{feature.desc}</div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  delay,
  parentVisible,
}: {
  step: typeof steps[0];
  delay: number;
  parentVisible: boolean;
}) {
  return (
    <div
      className={`reveal-card flex flex-col gap-3 ${parentVisible ? "visible" : ""}`}
      style={parentVisible ? { transitionDelay: `${delay}ms` } : {}}
    >
      <span className="text-3xl sm:text-4xl font-black text-slate-200 dark:text-slate-700 leading-none">
        {step.num}
      </span>
      <h3 className="font-semibold text-slate-900 dark:text-white text-base sm:text-lg">{step.title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{step.desc}</p>
    </div>
  );
}
