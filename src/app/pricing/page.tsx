"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const FREE_FEATURES = [
  "3 projects",
  "5 clients",
  "60 AI messages / month",
  "4 web searches / month",
  "10 price book items",
  "Unlimited invoices (basic)",
];

const PREMIUM_FEATURES = [
  "Unlimited projects & clients",
  "Unlimited AI messages",
  "Unlimited web searches",
  "Unlimited price book items",
  "Invoice PDF downloads & branding",
  "AI proposal generation",
  "Stripe Connect (receive payments)",
  "Client recurring billing",
  "Calendar with push notifications",
  "1 WhatsApp instance",
];

const TEAM_FEATURES = [
  "Everything in Premium",
  "2 seats (owner + 1 member)",
  "Shared workspace & data",
  "Each member's own WhatsApp",
  "Team invite by email & phone",
  "Extra seats: +$10/mo each",
];

export default function PricingPage() {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  const premiumPrice = interval === "annual" ? "$290/yr" : "$29/mo";
  const premiumSubtitle = interval === "annual" ? "($24.16/mo, billed annually)" : "billed monthly";
  const teamPrice = interval === "annual" ? "$490/yr" : "$49/mo";
  const teamSubtitle = interval === "annual" ? "($40.83/mo, billed annually)" : "billed monthly";

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Nav */}
      <header className="shrink-0 sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="WorkSupp" width={36} height={36} className="object-contain" />
            <span className="text-base sm:text-lg font-bold text-primary dark:text-white tracking-tight">WorkSupp</span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold text-white transition-colors bg-primary hover:bg-primary/90"
            >
              Get Started Free
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="text-center py-14 px-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
          Simple, transparent pricing
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg max-w-xl mx-auto">
          Start free, upgrade when you need more. No setup fees, cancel anytime.
        </p>

        {/* Interval toggle */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setInterval("monthly")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${interval === "monthly" ? "bg-primary text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("annual")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${interval === "annual" ? "bg-primary text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"}`}
          >
            Annual <span className="text-xs ml-1 opacity-75">Save 17%</span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="max-w-5xl mx-auto px-4 pb-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        {/* Free */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Free</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-white">$0</div>
            <div className="text-sm text-slate-400 mt-1">forever</div>
          </div>
          <ul className="flex-1 space-y-2 mb-6">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span> {f}
              </li>
            ))}
            <li className="flex items-start gap-2 text-sm text-slate-400">
              <span className="text-slate-300 dark:text-slate-600 mt-0.5 shrink-0">✗</span> Proposals
            </li>
            <li className="flex items-start gap-2 text-sm text-slate-400">
              <span className="text-slate-300 dark:text-slate-600 mt-0.5 shrink-0">✗</span> Stripe Connect
            </li>
            <li className="flex items-start gap-2 text-sm text-slate-400">
              <span className="text-slate-300 dark:text-slate-600 mt-0.5 shrink-0">✗</span> Team members
            </li>
          </ul>
          <Link
            href="/auth/signup"
            className="block text-center px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Get Started Free
          </Link>
        </div>

        {/* Premium */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-primary p-6 flex flex-col relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">Most Popular</span>
          </div>
          <div className="mb-4">
            <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Premium</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-white">{premiumPrice}</div>
            <div className="text-sm text-slate-400 mt-1">{premiumSubtitle}</div>
          </div>
          <ul className="flex-1 space-y-2 mb-6">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span> {f}
              </li>
            ))}
          </ul>
          <Link
            href={`/auth/signup?plan=premium&interval=${interval}`}
            className="block text-center px-4 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Start Premium
          </Link>
        </div>

        {/* Premium Team */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
          <div className="mb-4">
            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Premium Team</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-white">{teamPrice}</div>
            <div className="text-sm text-slate-400 mt-1">{teamSubtitle}</div>
          </div>
          <ul className="flex-1 space-y-2 mb-6">
            {TEAM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span className="text-blue-500 mt-0.5 shrink-0">✓</span> {f}
              </li>
            ))}
          </ul>
          <Link
            href={`/auth/signup?plan=premium_team&interval=${interval}`}
            className="block text-center px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            Start Team
          </Link>
        </div>
      </div>

      {/* FAQ / footer note */}
      <div className="text-center pb-12 px-4">
        <p className="text-sm text-slate-400">
          Sales tax applied at checkout based on your location. Questions?{" "}
          <a href="mailto:support@worksupp.app" className="text-primary hover:underline">Contact us</a>
        </p>
      </div>
    </div>
  );
}
