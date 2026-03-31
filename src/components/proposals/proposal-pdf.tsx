"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import type { ProposalData } from "@/app/api/proposals/generate/route";

interface ProposalDesign {
  primaryColor?: string | null;
  logoUrl?: string | null;
  titleFont?: string | null;
  bodyFont?: string | null;
  footer?: string | null;
}

interface Props {
  proposal: ProposalData;
  projectName: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  design?: ProposalDesign | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Parse hex color (#rrggbb or #rgb) into [r, g, b] tuple. Falls back to dark slate. */
function parseColor(hex?: string | null): [number, number, number] {
  if (!hex) return [17, 24, 39];
  const h = hex.replace("#", "");
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [17, 24, 39];
}

async function generateProposalPDF({
  proposal,
  projectName,
  companyName,
  companyEmail,
  companyPhone,
  design,
}: Props) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = parseColor(design?.primaryColor);

  // ── Logo (if available) ───────────────────────────────────────────────────
  let leftY = 52;
  if (design?.logoUrl) {
    try {
      const res = await fetch(design.logoUrl);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "AUTO", margin, leftY - 24, 80, 30);
      leftY += 14;
    } catch {
      // logo failed to load; fall through to text
    }
  }

  // ── LEFT: Company info ────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text(companyName || "Your Company", margin, leftY);
  leftY += 14;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  if (companyEmail) { doc.text(companyEmail, margin, leftY); leftY += 11; }
  if (companyPhone) { doc.text(companyPhone, margin, leftY); }

  // ── RIGHT: QUOTE header ────────────────────────────────────────────────────
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text("QUOTE", pageWidth - margin, 52, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  let rightY = 68;
  doc.text(`Date: ${new Date().toLocaleDateString("en-US")}`, pageWidth - margin, rightY, { align: "right" });
  rightY += 12;
  doc.text(`Valid until: ${proposal.validUntil}`, pageWidth - margin, rightY, { align: "right" });

  // ── Divider ───────────────────────────────────────────────────────────────
  const dividerY = 100;
  doc.setDrawColor(...primary);
  doc.setLineWidth(1.5);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);

  // ── Client + title ────────────────────────────────────────────────────────
  let y = dividerY + 18;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text("PREPARED FOR", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  y += 12;
  doc.text(proposal.clientName, margin, y);
  y += 20;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text(proposal.title, margin, y);
  y += 18;

  // ── Scope ─────────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60);
  doc.text("SCOPE OF WORK", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40);
  const scopeLines = doc.splitTextToSize(proposal.scope, pageWidth - margin * 2);
  doc.text(scopeLines, margin, y);
  y += scopeLines.length * 12 + 8;

  // ── Line items table ──────────────────────────────────────────────────────
  const tableBody = proposal.lineItems.map((item) => [
    item.description,
    String(item.qty),
    fmt(item.unitPrice),
    fmt(item.qty * item.unitPrice),
  ]);

  autoTable(doc, {
    startY: y + 8,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    headStyles: {
      fillColor: primary,
      textColor: 255,
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 80, halign: "right" },
      3: { cellWidth: 80, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 60;

  // ── Total ─────────────────────────────────────────────────────────────────
  const grandTotal = proposal.lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const col1 = pageWidth - margin - 80;
  const col2 = pageWidth - margin;
  let ty = finalY + 18;

  doc.setDrawColor(...primary);
  doc.setLineWidth(0.75);
  doc.line(col1 - 60, ty - 4, col2, ty - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text("TOTAL:", col1, ty + 8, { align: "right" });
  doc.text(fmt(grandTotal), col2, ty + 8, { align: "right" });

  // ── Terms ─────────────────────────────────────────────────────────────────
  if (proposal.terms) {
    ty += 28;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60);
    doc.text("TERMS & CONDITIONS", margin, ty);
    ty += 12;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    const termLines = doc.splitTextToSize(proposal.terms, pageWidth - margin * 2);
    doc.text(termLines, margin, ty);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerText = design?.footer ?? "This quote was generated by WorkSupp";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160);
  doc.text(footerText, pageWidth / 2, pageHeight - 30, { align: "center" });

  const slug = projectName.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);
  doc.save(`quote-${slug}.pdf`);
}

export function ProposalDownloadButton({ proposal, projectName, companyName, companyEmail, companyPhone, design }: Props) {
  function handleClick() {
    generateProposalPDF({ proposal, projectName, companyName, companyEmail, companyPhone, design })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
      });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors"
    >
      Download Quote PDF
    </button>
  );
}
