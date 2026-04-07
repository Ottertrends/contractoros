"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoginForm } from "@/components/auth/login-form";

const features = [
  {
    icon: "💬",
    title: "WhatsApp AI Assistant",
    desc: "Text your job details — get invoices drafted and material prices looked up instantly. No app switching.",
  },
  {
    icon: "🧾",
    title: "Professional Invoices",
    desc: "Create and send invoices in seconds. Track paid, outstanding, and draft in one clean view.",
  },
  {
    icon: "📋",
    title: "Project Tracking",
    desc: "Every job, client, and update organized — no paperwork, no spreadsheets.",
  },
];

export default function LandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col">

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="WorkSupp" width={36} height={36} className="object-contain sm:w-11 sm:h-11" />
            <span className="text-base sm:text-lg font-bold text-primary dark:text-white tracking-tight">WorkSupp</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap
                bg-primary hover:bg-primary/90
                dark:bg-primary/20 dark:text-blue-300 dark:hover:bg-primary/30 dark:border dark:border-blue-400/30"
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

      {/* ── Login Modal ─────────────────────────────────────────────── */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to WorkSupp</DialogTitle>
          </DialogHeader>
          <LoginForm />
        </DialogContent>
      </Dialog>

      {/* ── Privacy Policy Modal ─────────────────────────────────────── */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Privacy Policy for Worksupp</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-4 leading-relaxed">
            <p className="text-xs text-slate-400 dark:text-slate-500">Effective Date: April 6, 2026</p>
            <p>At Worksupp, accessible from https://worksupp.co, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by Worksupp and how we use it.</p>

            <h2 className="font-semibold text-slate-800 dark:text-white">Information We Collect</h2>
            <p>We only ask for personal information when we truly need it to provide a service to you.</p>
            <p><strong>Account Information:</strong> When you register, we may ask for your name and email address.</p>
            <p><strong>Google User Data:</strong> If you choose to log in via Google, we collect your email address and basic profile information (such as your name and profile picture) to identify you and provide our services.</p>

            <h2 className="font-semibold text-slate-800 dark:text-white">How We Use Your Information</h2>
            <p>We use the information we collect in various ways, including to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Provide, operate, and maintain our website.</li>
              <li>Improve, personalize, and expand our website.</li>
              <li>Understand and analyze how you use our website.</li>
              <li>Communicate with you, either directly or through one of our partners, for customer service or updates.</li>
            </ul>

            <h2 className="font-semibold text-slate-800 dark:text-white">Google API Disclosure</h2>
            <p>Worksupp&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not share your Google user data with third-party &quot;AI models&quot; or other external tools.</p>

            <h2 className="font-semibold text-slate-800 dark:text-white">Data Storage and Security</h2>
            <p>We retain collected information for as long as necessary to provide you with your requested service. What data we store, we&apos;ll protect within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure, copying, use, or modification.</p>

            <h2 className="font-semibold text-slate-800 dark:text-white">Third-Party Privacy Policies</h2>
            <p>Worksupp&apos;s Privacy Policy does not apply to other advertisers or websites. Thus, we are advising you to consult the respective Privacy Policies of these third-party servers for more detailed information.</p>

            <h2 className="font-semibold text-slate-800 dark:text-white">Your Data Protection Rights</h2>
            <p>You have the right to request copies of your personal data, request that we correct any information you believe is inaccurate, or request that we erase your personal data under certain conditions.</p>

            <h2 className="font-semibold text-slate-800 dark:text-white">Contact Us</h2>
            <p>If you have additional questions or require more information about our Privacy Policy, do not hesitate to contact us at:</p>
            <p>Email: <a href="mailto:support@worksupp.co" className="text-primary hover:underline">support@worksupp.co</a></p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-16 gap-8 sm:gap-12 max-w-5xl mx-auto w-full">

        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-3 sm:gap-5 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 text-xs sm:text-sm font-medium px-3 py-1 rounded-full">
            🤖 AI-powered for contractors
          </span>
          <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
            Run your business<br className="hidden sm:block" /> from your phone
          </h1>
          <p className="text-sm sm:text-lg text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
            Track jobs, generate invoices, and get material prices — all through WhatsApp and a simple dashboard built for contractors.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 w-full">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-row sm:flex-col items-start gap-3 sm:gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm"
            >
              <div className="text-2xl sm:text-4xl shrink-0">{f.icon}</div>
              <div className="flex flex-col gap-0.5 sm:gap-2">
                <div className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">{f.title}</div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust line */}
        <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 text-center">
          Trusted by independent contractors · No setup fees · Cancel anytime
        </p>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="shrink-0 py-5 text-center text-xs text-slate-400 dark:text-slate-600 border-t border-slate-200 dark:border-slate-800">
        Powered by{" "}
        <a href="https://otterq.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          OtterQ
        </a>
        {" "}· Built for the trades ·{" "}
        <button onClick={() => setPrivacyOpen(true)} className="text-primary hover:underline">
          Privacy Policy
        </button>
      </footer>
    </div>
  );
}
