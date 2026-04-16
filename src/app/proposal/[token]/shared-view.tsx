"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { ProposalData, ProposalDesign, ContentBlock } from "@/lib/types/proposals";
import { fmt } from "@/lib/types/proposals";

const ProposalPdfButtons = dynamic(
  () => import("@/components/proposals/proposal-pdf").then((m) => m.ProposalPdfButtons),
  { ssr: false },
);

interface Props {
  proposal: ProposalData;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  projectName: string;
  design: ProposalDesign | null;
  contentBlocks: ContentBlock[];
  logoUrl?: string | null;
}

export function SharedProposalView({
  proposal,
  companyName,
  companyEmail,
  companyPhone,
  projectName,
  design,
  contentBlocks,
  logoUrl,
}: Props) {
  const total = proposal.lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company logo" className="h-10 max-w-[120px] object-contain mb-2" />
            )}
            {companyName && (
              <p className="text-lg font-bold text-slate-900 dark:text-white">{companyName}</p>
            )}
            {companyEmail && <p className="text-sm text-slate-500">{companyEmail}</p>}
            {companyPhone && <p className="text-sm text-slate-500">{companyPhone}</p>}
          </div>
          <ProposalPdfButtons
            proposal={proposal}
            projectName={projectName}
            companyName={companyName}
            companyEmail={companyEmail}
            companyPhone={companyPhone}
            design={design}
            contentBlocks={contentBlocks}
          />
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 space-y-6">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Quote</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {proposal.title}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Prepared for: {proposal.clientName}</p>
          </div>

          {/* Scope */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Scope of Work
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {proposal.scope}
            </p>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Line Items
            </p>
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
                  {proposal.lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-900">
                      <td className="py-2 text-slate-700 dark:text-slate-300">
                        {item.description}
                      </td>
                      <td className="py-2 text-right text-slate-500">{item.qty}</td>
                      <td className="py-2 text-right text-slate-500">{fmt(item.unitPrice)}</td>
                      <td className="py-2 text-right font-medium text-slate-800 dark:text-slate-200">
                        {fmt(item.qty * item.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={3}
                      className="pt-3 text-right font-bold text-slate-900 dark:text-white pr-4"
                    >
                      Total
                    </td>
                    <td className="pt-3 text-right font-bold text-slate-900 dark:text-white">
                      {fmt(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Terms */}
          {proposal.terms && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                Terms & Conditions
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                {proposal.terms}
              </p>
              {proposal.validUntil && (
                <p className="text-xs text-slate-400 mt-1">
                  Valid until: {proposal.validUntil}
                </p>
              )}
            </div>
          )}

          {/* Content blocks */}
          {contentBlocks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
                Project Documentation
              </p>
              <div className="space-y-4">
                {contentBlocks.map((block, i) => (
                  <div key={i}>
                    {block.type === "note" ? (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-3">
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {block.content}
                        </p>
                      </div>
                    ) : block.imageUrl ? (
                      <div>
                        <img
                          src={block.imageUrl}
                          alt={block.description ?? "Project image"}
                          className="rounded-lg max-h-[15.6rem] w-auto max-w-full object-contain border border-slate-100 dark:border-slate-800"
                        />
                        {block.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed whitespace-pre-wrap">
                            {block.description}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-slate-400 pb-4">
          Quote generated by {companyName || "ContractorOS"}
        </p>
      </div>
    </div>
  );
}
