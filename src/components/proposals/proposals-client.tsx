"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";

import type { ProposalData } from "@/app/api/proposals/generate/route";

// Load jsPDF-dependent component only on the client (fflate uses Node Workers incompatible with SSR)
const ProposalDownloadButton = dynamic(
  () => import("./proposal-pdf").then((m) => m.ProposalDownloadButton),
  { ssr: false },
);

interface Project {
  id: string;
  name: string | null;
  client_name?: string | null;
  status?: string | null;
}

interface Props {
  projects: Project[];
}

interface ProposalDesign {
  primaryColor?: string | null;
  logoUrl?: string | null;
  titleFont?: string | null;
  bodyFont?: string | null;
  footer?: string | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function ProposalsClient({ projects }: Props) {
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [mode, setMode] = React.useState<"strict" | "custom">("strict");
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{
    proposal: ProposalData;
    projectName: string;
    companyName: string;
    companyEmail: string;
    companyPhone: string;
    design: ProposalDesign | null;
  } | null>(null);

  async function handleGenerate() {
    if (!selectedId) {
      toast.error("Please select a project first");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedId,
          mode,
          customInstructions: mode === "custom" ? customInstructions : undefined,
        }),
      });
      const data = (await res.json()) as {
        proposal?: ProposalData;
        projectName?: string;
        companyName?: string;
        companyEmail?: string;
        companyPhone?: string;
        design?: ProposalDesign | null;
        error?: string;
      };
      if (!res.ok || !data.proposal) {
        throw new Error(data.error ?? "Generation failed");
      }
      setResult({
        proposal: data.proposal,
        projectName: data.projectName ?? "proposal",
        companyName: data.companyName ?? "",
        companyEmail: data.companyEmail ?? "",
        companyPhone: data.companyPhone ?? "",
        design: data.design ?? null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate proposal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Project selector + mode */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Generate Quote</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select a project and let AI generate a professional quote PDF using your project notes, media, and billing history.
          </p>
        </div>

        {/* Project selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setResult(null); }}
            className="flex-1 rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">— Select a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? "Untitled"}{p.client_name ? ` · ${p.client_name}` : ""}
              </option>
            ))}
          </select>
        </div>
        {projects.length === 0 && (
          <p className="text-sm text-slate-400">No projects found. Create a project first via WhatsApp or the Projects page.</p>
        )}

        {/* Mode selector */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Generation mode</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                mode === "strict"
                  ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="strict"
                  checked={mode === "strict"}
                  onChange={() => setMode("strict")}
                  className="accent-slate-900 dark:accent-white"
                />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Strict</span>
              </div>
              <p className="text-xs text-slate-400 pl-5">Claude uses only the data you have uploaded — no inferred prices or invented line items.</p>
            </label>
            <label
              className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                mode === "custom"
                  ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-900"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="custom"
                  checked={mode === "custom"}
                  onChange={() => setMode("custom")}
                  className="accent-slate-900 dark:accent-white"
                />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Custom</span>
              </div>
              <p className="text-xs text-slate-400 pl-5">Add your own instructions, T&Cs, or scope for Claude to polish the document.</p>
            </label>
          </div>
        </div>

        {/* Custom instructions textarea */}
        {mode === "custom" && (
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">
              Your instructions / T&Cs / scope
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Payment is 50% upfront, 50% on completion. All work is guaranteed for 1 year. Include a mobilization fee of $500..."
              rows={4}
              className="w-full rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={loading || !selectedId}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 border-2 border-white border-t-transparent dark:border-slate-900 dark:border-t-transparent rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Quote"
          )}
        </button>
      </div>

      {/* Result preview */}
      {result && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{result.proposal.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Prepared for: {result.proposal.clientName}</p>
            </div>
            <ProposalDownloadButton
              proposal={result.proposal}
              projectName={result.projectName}
              companyName={result.companyName}
              companyEmail={result.companyEmail}
              companyPhone={result.companyPhone}
              design={result.design}
            />
          </div>

          {/* Scope */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Scope of Work</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.proposal.scope}</p>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Line Items</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-slate-500 text-xs uppercase tracking-wide">
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium text-right">Qty</th>
                    <th className="pb-2 font-medium text-right">Unit Price</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.proposal.lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-900">
                      <td className="py-2 text-slate-700 dark:text-slate-300">{item.description}</td>
                      <td className="py-2 text-right text-slate-500">{item.qty}</td>
                      <td className="py-2 text-right text-slate-500">{fmt(item.unitPrice)}</td>
                      <td className="py-2 text-right font-medium text-slate-800 dark:text-slate-200">{fmt(item.qty * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="pt-3 text-right font-bold text-slate-900 dark:text-white pr-4">Total</td>
                    <td className="pt-3 text-right font-bold text-slate-900 dark:text-white">
                      {fmt(result.proposal.lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Terms */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Terms</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{result.proposal.terms}</p>
            <p className="text-xs text-slate-400 mt-1">Valid until: {result.proposal.validUntil}</p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => { setResult(null); }}
              className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Generate another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
