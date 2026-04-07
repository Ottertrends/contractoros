"use client";

import * as React from "react";
import { toast } from "sonner";

const BUSINESS_AREA_OPTIONS = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
];

const SERVICE_OPTIONS = [
  { value: "concrete", label: "Concrete" },
  { value: "framing", label: "Framing" },
  { value: "remodeling", label: "Remodeling" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "drywall", label: "Drywall" },
  { value: "excavation", label: "Excavation" },
  { value: "landscaping", label: "Landscaping" },
];

const QUOTES_OPTIONS = [
  { value: "1-5", label: "1–5 per month" },
  { value: "6-15", label: "6–15 per month" },
  { value: "16-30", label: "16–30 per month" },
  { value: "30+", label: "30+ per month" },
];

interface Props {
  show: boolean;
  defaultCompanyName?: string;
}

export function ProfileSetupModal({ show, defaultCompanyName = "" }: Props) {
  const [visible, setVisible] = React.useState(show);
  const [submitting, setSubmitting] = React.useState(false);

  const [phone, setPhone] = React.useState("");
  const [companyName, setCompanyName] = React.useState(defaultCompanyName);
  const [zipCode, setZipCode] = React.useState("");
  const [quotesPerMonth, setQuotesPerMonth] = React.useState("1-5");
  const [businessAreas, setBusinessAreas] = React.useState<string[]>([]);
  const [services, setServices] = React.useState<string[]>([]);

  if (!visible) return null;

  function toggleItem(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (businessAreas.length === 0) {
      toast.error("Select at least one business area");
      return;
    }
    if (services.length === 0) {
      toast.error("Select at least one service");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, company_name: companyName, zip_code: zipCode, quotes_per_month: quotesPerMonth, business_areas: businessAreas, services }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed to save profile");
      setVisible(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Complete your profile</h2>
          <p className="text-sm text-slate-500 mt-1">
            Help your AI assistant give you better, personalized results.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 flex flex-col gap-5">
          {/* Phone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Company name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Company name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Contractors LLC"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Zip code */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Zip code <span className="text-xs text-slate-400">(optional — for local pricing)</span>
            </label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="90210"
              maxLength={10}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Quotes per month */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              How many quotes do you do per month?
            </label>
            <select
              value={quotesPerMonth}
              onChange={(e) => setQuotesPerMonth(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {QUOTES_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Business areas */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Business areas <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_AREA_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleItem(businessAreas, setBusinessAreas, o.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    businessAreas.includes(o.value)
                      ? "bg-primary text-white border-primary"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary/50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Services */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Services you offer <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SERVICE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleItem(services, setServices, o.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    services.includes(o.value)
                      ? "bg-primary text-white border-primary"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary/50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors mt-1"
          >
            {submitting ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
