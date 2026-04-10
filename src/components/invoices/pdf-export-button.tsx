"use client";

import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { InvoiceDesign, InvoiceStatus, Project } from "@/lib/types/database";

interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
  tax_rate?: string | null; // percentage e.g. "8.75"
}

interface SavedTaxRate {
  name: string;
  rate: string;
}

interface PdfInvoice {
  invoice_number: string | null;
  status: InvoiceStatus;
  notes: string | null;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  created_at?: string;
}

interface PdfProfile {
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface Props {
  invoice: PdfInvoice;
  project: Project | null;
  profile: PdfProfile | null;
  design?: InvoiceDesign | null;
  items: LineItem[];
  savedTaxRates?: SavedTaxRate[];
  /** Stripe Connect payment link shown on PDF when sent */
  stripePaymentLinkUrl?: string | null;
  /** Zelle, Venmo, ACH — custom block */
  alternatePaymentInstructions?: string | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [17, 24, 39]; // default dark
  return [r, g, b];
}

async function loadImageBase64(url: string): Promise<{ data: string; format: "PNG" | "JPEG" } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const format = blob.type.includes("png") ? "PNG" : "JPEG";
        resolve({ data: result, format });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Fetch a logo, resize it to fill maxPtW × maxPtH points (maintaining aspect ratio),
 * and return the resized base64 data + actual pt dimensions for correct PDF placement.
 * Renders at 3× pixel density with high-quality smoothing for crisp print output.
 */
async function resizeLogoForPdf(
  url: string,
  maxPtW: number,
  maxPtH: number,
): Promise<{ data: string; format: "PNG" | "JPEG"; ptW: number; ptH: number } | null> {
  const raw = await loadImageBase64(url);
  if (!raw) return null;

  const scale = 3; // 3× density — sharp on HiDPI screens and in print

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Compute pt display size that preserves aspect ratio within the max box
      const ar = img.naturalWidth / img.naturalHeight;
      let ptW: number, ptH: number;
      if (ar >= maxPtW / maxPtH) {
        ptW = maxPtW;
        ptH = maxPtW / ar;
      } else {
        ptH = maxPtH;
        ptW = maxPtH * ar;
      }

      const pxW = Math.round(ptW * scale);
      const pxH = Math.round(ptH * scale);

      const canvas = document.createElement("canvas");
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ ...raw, ptW, ptH });
        return;
      }

      // High-quality downscaling / upscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, pxW, pxH);

      const mime = raw.format === "PNG" ? "image/png" : "image/jpeg";
      const data = canvas.toDataURL(mime, 0.95);
      resolve({ data, format: raw.format, ptW, ptH });
    };
    img.onerror = () => resolve({ ...raw, ptW: maxPtW, ptH: maxPtH });
    img.src = raw.data;
  });
}

async function generatePDF({
  invoice,
  project,
  profile,
  design,
  items,
  savedTaxRates = [],
  stripePaymentLinkUrl,
  alternatePaymentInstructions,
}: Props) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Design defaults
  const primaryColor = design?.primaryColor ?? "#111827";
  const [pr, pg, pb] = hexToRgb(primaryColor);
  const titleFont = design?.titleFont ?? "helvetica";
  const bodyFont = design?.bodyFont ?? "helvetica";

  // Set base font
  doc.setFont(bodyFont, "normal");

  // ── LEFT COLUMN: Logo → Company Name → Address → Email | Phone ─────────────
  let leftY = 36;

  // Logo (top-left) — auto-resized to fit within 120×50 pt, aspect ratio preserved
  if (design?.logoUrl) {
    const img = await resizeLogoForPdf(design.logoUrl, 120, 50);
    if (img) {
      try {
        doc.addImage(img.data, img.format, margin, leftY, img.ptW, img.ptH, undefined, "SLOW");
        leftY += img.ptH + 14; // 14 pt gap between logo bottom and company name
      } catch { /* skip bad image */ }
    }
  }

  // Company name
  doc.setFontSize(14);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text(profile?.company_name ?? "Your Company", margin, leftY);
  leftY += 14;

  // Address lines (if profile had address — for now just show contact)
  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(90);
  if (profile?.email) { doc.text(profile.email, margin, leftY); leftY += 11; }
  if (profile?.phone) { doc.text(profile.phone, margin, leftY); leftY += 11; }

  // ── RIGHT COLUMN: INVOICE → # → Date ────────────────────────────────────
  // "INVOICE" large heading
  doc.setFontSize(26);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("INVOICE", pageWidth - margin, 52, { align: "right" });

  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(80);
  const dateStr = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString("en-US")
    : new Date().toLocaleDateString("en-US");
  let rightY = 68;
  doc.text(`Invoice #: ${invoice.invoice_number ?? "—"}`, pageWidth - margin, rightY, { align: "right" });
  rightY += 12;
  doc.text(`Date: ${dateStr}`, pageWidth - margin, rightY, { align: "right" });

  // PAID badge — shown when invoice is paid
  if (invoice.status === "paid") {
    rightY += 18;
    const badgeW = 58;
    const badgeH = 18;
    const badgeX = pageWidth - margin - badgeW;
    const badgeY = rightY - 13;
    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(1.5);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, "FD");
    doc.setFont(titleFont, "bold");
    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.text("PAID", badgeX + badgeW / 2, badgeY + badgeH / 2 + 3.5, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  const dividerY = Math.max(leftY, rightY) + 14;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1.5);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);

  // ── Bill To ───────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("BILL TO", margin, dividerY + 16);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(40);
  let y = dividerY + 28;
  if (project?.client_name) { doc.text(project.client_name, margin, y); y += 12; }
  if (project?.address) { doc.text(project.address, margin, y); y += 12; }
  const cityParts = [project?.city, project?.state, project?.zip].filter(Boolean);
  if (cityParts.length) { doc.text(cityParts.join(", "), margin, y); y += 12; }
  if (project?.name) {
    y += 2;
    doc.setFont(titleFont, "bold");
    doc.setTextColor(80);
    doc.text(`Project: ${project.name}`, margin, y);
    y += 4;
  }

  // ── Line items table ──────────────────────────────────────────────────────
  const hasAnyLineTax = items.some((it) => (parseFloat(it.tax_rate ?? "0") || 0) > 0);

  const tableBody = items.map((it) => {
    const taxPct = parseFloat(it.tax_rate ?? "0") || 0;
    const row = [
      it.description,
      String(parseFloat(it.quantity) || 0),
      fmt(parseFloat(it.unit_price) || 0),
    ];
    if (hasAnyLineTax) row.push(taxPct > 0 ? `${taxPct}%` : "");
    row.push(fmt(parseFloat(it.total) || 0));
    return row;
  });

  const headerLabels = ["Description", "Qty", "Unit Price"];
  if (hasAnyLineTax) headerLabels.push("Tax");
  headerLabels.push("Total");

  // Right-align numeric column headers (consistent with data alignment).
  const headerRow = headerLabels.map((h, i) => ({
    content: h,
    styles: { halign: (i === 0 ? "left" : "right") as "left" | "right" },
  }));

  const columnStyles: Record<number, { cellWidth: number | "auto"; halign?: "left" | "right" | "center" }> = {
    0: { cellWidth: "auto", halign: "left" },
    1: { cellWidth: 40, halign: "right" },
    2: { cellWidth: 80, halign: "right" },
  };
  if (hasAnyLineTax) {
    columnStyles[3] = { cellWidth: 55, halign: "right" };
    columnStyles[4] = { cellWidth: 75, halign: "right" };
  } else {
    columnStyles[3] = { cellWidth: 75, halign: "right" };
  }

  autoTable(doc, {
    startY: y + 14,
    head: [headerRow],
    body: tableBody,
    headStyles: {
      fillColor: [pr, pg, pb],
      textColor: 255,
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, font: bodyFont },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 60;

  // ── Totals ────────────────────────────────────────────────────────────────
  // Two-column totals: labels left-aligned at labelX (aligned with table's numeric columns),
  // amounts right-aligned at amtX. 200pt label area handles long tax breakdown text.
  const labelX = pageWidth - margin - 200;
  const amtX   = pageWidth - margin;
  let ty = finalY + 18;

  const subtotal = parseFloat(invoice.subtotal) || 0;
  const taxRate = parseFloat(invoice.tax_rate) || 0;
  const taxAmount = parseFloat(invoice.tax_amount) || 0;
  const total = parseFloat(invoice.total) || 0;

  // Compute per-rate breakdown (Stripe-style: "Texas Tax (8.75% on $150.00)")
  interface TaxBreakdown { label: string; rate: number; taxableAmount: number; taxAmt: number }
  const taxBreakdown: TaxBreakdown[] = [];
  if (hasAnyLineTax) {
    const rateMap = new Map<number, TaxBreakdown>();
    for (const it of items) {
      const pct = parseFloat(it.tax_rate ?? "0") || 0;
      if (pct === 0) continue;
      const lineSubtotal = parseFloat(it.total) || 0;
      const matched = savedTaxRates.find((r) => Math.abs(parseFloat(r.rate) - pct) < 0.001);
      const label = matched?.name ?? "Tax";
      if (rateMap.has(pct)) {
        const e = rateMap.get(pct)!;
        e.taxableAmount += lineSubtotal;
        e.taxAmt += lineSubtotal * pct / 100;
      } else {
        rateMap.set(pct, { label, rate: pct, taxableAmount: lineSubtotal, taxAmt: lineSubtotal * pct / 100 });
      }
    }
    taxBreakdown.push(...rateMap.values());
  }

  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(60);
  doc.text("Subtotal:", labelX, ty);
  doc.text(fmt(subtotal), amtX, ty, { align: "right" });
  ty += 14;

  if (taxAmount > 0) {
    if (hasAnyLineTax && taxBreakdown.length > 0) {
      // Stripe-style: "Total excl. tax" + per-rate breakdown lines
      doc.text("Total excl. tax:", labelX, ty);
      doc.text(fmt(subtotal), amtX, ty, { align: "right" });
      ty += 14;
      for (const b of taxBreakdown) {
        const label = `${b.label} (${b.rate}% on ${fmt(b.taxableAmount)}):`;
        doc.text(label, labelX, ty);
        doc.text(fmt(b.taxAmt), amtX, ty, { align: "right" });
        ty += 14;
      }
    } else {
      const taxLabel = taxRate > 0 ? `Tax (${taxRate}%):` : "Tax:";
      doc.text(taxLabel, labelX, ty);
      doc.text(fmt(taxAmount), amtX, ty, { align: "right" });
      ty += 14;
    }
  }

  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.75);
  doc.line(labelX, ty - 4, amtX, ty - 4);

  doc.setFont(titleFont, "bold");
  doc.setFontSize(11);
  doc.setTextColor(pr, pg, pb);
  doc.text("TOTAL:", labelX, ty + 8);
  doc.text(fmt(total), amtX, ty + 8, { align: "right" });

  ty += 36;
  doc.setFontSize(9);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(60);
  if (stripePaymentLinkUrl) {
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);
    doc.text("Pay online via credit card, ACH and other payment options:", margin, ty);
    ty += 14;
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(0, 102, 204);
    doc.text("Stripe Payment Link", margin, ty);
    doc.link(margin, ty - 10, doc.getTextWidth("Stripe Payment Link"), 13, { url: stripePaymentLinkUrl });
    doc.setTextColor(60);
    ty += 16;
  }
  if (alternatePaymentInstructions) {
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);
    doc.text("Other payment options", margin, ty);
    ty += 12;
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(80);
    const alt = doc.splitTextToSize(alternatePaymentInstructions, pageWidth - margin * 2);
    doc.text(alt, margin, ty);
    ty += alt.length * 12 + 8;
  }

  // ── Invoice notes ─────────────────────────────────────────────────────────
  if (invoice.notes) {
    ty += 28;
    doc.setFontSize(9);
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);
    doc.text("Notes:", margin, ty);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(80);
    const lines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(lines, margin, ty + 12);
  }

  // ── Footer message ────────────────────────────────────────────────────────
  if (design?.footer) {
    const footerY = pageHeight - 30;
    doc.setFontSize(8);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(160);
    const footerLines = doc.splitTextToSize(design.footer, pageWidth - margin * 2);
    doc.text(footerLines, pageWidth / 2, footerY, { align: "center" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `invoice-${invoice.invoice_number ?? "draft"}.pdf`;
  doc.save(filename);
}

export function PdfExportButton({
  invoice,
  project,
  profile,
  design,
  items,
  savedTaxRates,
  stripePaymentLinkUrl,
  alternatePaymentInstructions,
}: Props) {
  async function handleClick() {
    try {
      await generatePDF({
        invoice,
        project,
        profile,
        design,
        items,
        savedTaxRates,
        stripePaymentLinkUrl,
        alternatePaymentInstructions,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
    >
      Export PDF
    </button>
  );
}
