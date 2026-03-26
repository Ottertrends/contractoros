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

async function generatePDF({ invoice, project, profile, design, items }: Props) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Design defaults
  const primaryColor = design?.primaryColor ?? "#111827";
  const [pr, pg, pb] = hexToRgb(primaryColor);
  const fontName = design?.font ?? "helvetica";

  // Set base font
  doc.setFont(fontName, "normal");

  // ── Logo ───────────────────────────────────────────────────────────────────
  let logoHeight = 0;
  if (design?.logoUrl) {
    const img = await loadImageBase64(design.logoUrl);
    if (img) {
      const maxW = 120;
      const maxH = 48;
      // jsPDF getImageProperties requires the image to be added first via addImage
      try {
        // Estimate aspect — place at max dimensions and let jsPDF clip
        doc.addImage(img.data, img.format, margin, 30, maxW, maxH, undefined, "FAST");
        logoHeight = maxH + 8;
      } catch {
        // Logo failed to load — skip
      }
    }
  }

  const headerTop = 30 + logoHeight;

  // ── Company info ──────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont(fontName, "bold");
  doc.setTextColor(pr, pg, pb);
  if (!design?.logoUrl) {
    doc.text(profile?.company_name ?? "Your Company", margin, headerTop + 24);
  }

  doc.setFontSize(9);
  doc.setFont(fontName, "normal");
  doc.setTextColor(100);
  const contactLine = [profile?.phone, profile?.email].filter(Boolean).join("  |  ");
  const contactY = design?.logoUrl ? headerTop + 8 : headerTop + 38;
  if (contactLine) doc.text(contactLine, margin, contactY);

  // ── INVOICE label (right side) ────────────────────────────────────────────
  doc.setFontSize(22);
  doc.setFont(fontName, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("INVOICE", pageWidth - margin, headerTop + 24, { align: "right" });

  doc.setFontSize(9);
  doc.setFont(fontName, "normal");
  doc.setTextColor(80);
  const dateStr = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString("en-US")
    : new Date().toLocaleDateString("en-US");
  doc.text(`Invoice #: ${invoice.invoice_number ?? "—"}`, pageWidth - margin, headerTop + 38, { align: "right" });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, headerTop + 50, { align: "right" });
  doc.text(`Status: ${invoice.status.toUpperCase()}`, pageWidth - margin, headerTop + 62, { align: "right" });

  // ── Divider ───────────────────────────────────────────────────────────────
  const dividerY = headerTop + 72;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1.5);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);

  // ── Bill To ───────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont(fontName, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("BILL TO", margin, dividerY + 16);
  doc.setFont(fontName, "normal");
  doc.setTextColor(40);
  let y = dividerY + 28;
  if (project?.client_name) { doc.text(project.client_name, margin, y); y += 12; }
  if (project?.address) { doc.text(project.address, margin, y); y += 12; }
  const cityLine = [project?.city, project?.state, project?.zip].filter(Boolean).join(", ");
  if (cityLine) { doc.text(cityLine, margin, y); y += 12; }
  if (project?.name) {
    y += 2;
    doc.setFont(fontName, "bold");
    doc.setTextColor(80);
    doc.text(`Project: ${project.name}`, margin, y);
    y += 4;
  }

  // ── Line items table ──────────────────────────────────────────────────────
  const tableBody = items.map((it) => [
    it.description,
    String(parseFloat(it.quantity) || 0),
    fmt(parseFloat(it.unit_price) || 0),
    fmt(parseFloat(it.total) || 0),
  ]);

  autoTable(doc, {
    startY: y + 14,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    headStyles: {
      fillColor: [pr, pg, pb],
      textColor: 255,
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: 9, font: fontName },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 75, halign: "right" },
      3: { cellWidth: 75, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 60;

  // ── Totals ────────────────────────────────────────────────────────────────
  const col1 = pageWidth - margin - 80;
  const col2 = pageWidth - margin;
  let ty = finalY + 18;

  const subtotal = parseFloat(invoice.subtotal) || 0;
  const taxRate = parseFloat(invoice.tax_rate) || 0;
  const taxAmount = parseFloat(invoice.tax_amount) || 0;
  const total = parseFloat(invoice.total) || 0;

  doc.setFontSize(9);
  doc.setFont(fontName, "normal");
  doc.setTextColor(60);
  doc.text("Subtotal:", col1, ty, { align: "right" });
  doc.text(fmt(subtotal), col2, ty, { align: "right" });
  ty += 14;

  if (taxRate > 0) {
    doc.text(`Tax (${taxRate}%):`, col1, ty, { align: "right" });
    doc.text(fmt(taxAmount), col2, ty, { align: "right" });
    ty += 14;
  }

  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.75);
  doc.line(col1 - 60, ty - 4, col2, ty - 4);

  doc.setFont(fontName, "bold");
  doc.setFontSize(11);
  doc.setTextColor(pr, pg, pb);
  doc.text("TOTAL:", col1, ty + 8, { align: "right" });
  doc.text(fmt(total), col2, ty + 8, { align: "right" });

  // ── Invoice notes ─────────────────────────────────────────────────────────
  if (invoice.notes) {
    ty += 28;
    doc.setFontSize(9);
    doc.setFont(fontName, "bold");
    doc.setTextColor(60);
    doc.text("Notes:", margin, ty);
    doc.setFont(fontName, "normal");
    doc.setTextColor(80);
    const lines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(lines, margin, ty + 12);
  }

  // ── Footer message ────────────────────────────────────────────────────────
  if (design?.footer) {
    const footerY = pageHeight - 30;
    doc.setFontSize(8);
    doc.setFont(fontName, "normal");
    doc.setTextColor(160);
    const footerLines = doc.splitTextToSize(design.footer, pageWidth - margin * 2);
    doc.text(footerLines, pageWidth / 2, footerY, { align: "center" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `invoice-${invoice.invoice_number ?? "draft"}.pdf`;
  doc.save(filename);
}

export function PdfExportButton({ invoice, project, profile, design, items }: Props) {
  async function handleClick() {
    try {
      await generatePDF({ invoice, project, profile, design, items });
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
