/**
 * Server-side invoice PDF (Node). Used for Gmail attachments.
 * Simplified vs client export: logo skipped if fetch fails.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

import type { InvoiceDesign, InvoiceStatus, Project } from "@/lib/types/database";

export interface ServerPdfLineItem {
  description: string;
  quantity: string;
  unit_price: string;
  total: string;
}

export interface ServerPdfInvoice {
  invoice_number: string | null;
  status: InvoiceStatus;
  notes: string | null;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  created_at?: string;
}

export interface ServerPdfProfile {
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [17, 24, 39];
  return [r, g, b];
}

export async function buildInvoicePdfBuffer(opts: {
  invoice: ServerPdfInvoice;
  project: Project | null;
  profile: ServerPdfProfile | null;
  design?: InvoiceDesign | null;
  items: ServerPdfLineItem[];
  stripePaymentLinkUrl?: string | null;
  stripeHostedUrl?: string | null;
  alternatePaymentInstructions?: string | null;
}): Promise<Buffer> {
  const { invoice, project, profile, design, items, stripePaymentLinkUrl, stripeHostedUrl, alternatePaymentInstructions } = opts;
  // Prefer Stripe Invoices hosted URL over legacy payment link
  const payOnlineUrl = stripeHostedUrl ?? stripePaymentLinkUrl ?? null;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const primaryColor = design?.primaryColor ?? "#111827";
  const [pr, pg, pb] = hexToRgb(primaryColor);
  const titleFont = design?.titleFont ?? "helvetica";
  const bodyFont = design?.bodyFont ?? "helvetica";

  doc.setFont(bodyFont, "normal");

  let leftY = 36;
  if (design?.logoUrl) {
    try {
      const res = await fetch(design.logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const b64 = buf.toString("base64");
        const mime = res.headers.get("content-type")?.includes("png") ? "PNG" : "JPEG";
        doc.addImage(`data:image/${mime.toLowerCase()};base64,${b64}`, mime, margin, leftY, 120, 40);
        leftY += 54;
      }
    } catch {
      /* skip logo */
    }
  }

  doc.setFontSize(14);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text(profile?.company_name ?? "Your Company", margin, leftY);
  leftY += 14;
  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(90);
  if (profile?.email) {
    doc.text(profile.email, margin, leftY);
    leftY += 11;
  }
  if (profile?.phone) {
    doc.text(profile.phone, margin, leftY);
    leftY += 11;
  }

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

  const dividerY = Math.max(leftY, rightY) + 14;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1.5);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);

  doc.setFontSize(9);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("BILL TO", margin, dividerY + 16);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(40);
  let y = dividerY + 28;
  if (project?.client_name) {
    doc.text(project.client_name, margin, y);
    y += 12;
  }
  if (project?.address) {
    doc.text(project.address, margin, y);
    y += 12;
  }
  const cityParts = [project?.city, project?.state, project?.zip].filter(Boolean);
  if (cityParts.length) {
    doc.text(cityParts.join(", "), margin, y);
    y += 12;
  }
  if (project?.name) {
    y += 2;
    doc.setFont(titleFont, "bold");
    doc.setTextColor(80);
    doc.text(`Project: ${project.name}`, margin, y);
    y += 4;
  }

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
    headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, font: bodyFont },
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

  const col1 = pageWidth - margin - 80;
  const col2 = pageWidth - margin;
  let ty = finalY + 18;

  const subtotal = parseFloat(invoice.subtotal) || 0;
  const taxRate = parseFloat(invoice.tax_rate) || 0;
  const taxAmount = parseFloat(invoice.tax_amount) || 0;
  const total = parseFloat(invoice.total) || 0;

  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
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
  doc.setFont(titleFont, "bold");
  doc.setFontSize(11);
  doc.setTextColor(pr, pg, pb);
  doc.text("TOTAL:", col1, ty + 8, { align: "right" });
  doc.text(fmt(total), col2, ty + 8, { align: "right" });

  ty += 36;
  doc.setFontSize(9);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(60);
  if (payOnlineUrl) {
    // "Pay Online →" button box
    const btnW = 100;
    const btnH = 20;
    doc.setFillColor(pr, pg, pb);
    doc.roundedRect(margin, ty - 13, btnW, btnH, 3, 3, "F");
    doc.setFont(titleFont, "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Pay Online →", margin + btnW / 2, ty - 13 + btnH / 2 + 3, { align: "center" });
    doc.setTextColor(60);
    doc.setFont(bodyFont, "normal");
    ty += 16;

    // QR code (80x80 pt) to the right of the text block
    try {
      const qrDataUrl = await QRCode.toDataURL(payOnlineUrl, { width: 200, margin: 1 });
      const qrSize = 70;
      doc.addImage(qrDataUrl, "PNG", pageWidth - margin - qrSize, ty - 30, qrSize, qrSize);
    } catch {
      /* skip QR on error */
    }

    doc.setFontSize(9);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(0, 102, 204);
    doc.text("Stripe Payment Link", margin, ty);
    doc.link(margin, ty - 10, doc.getTextWidth("Stripe Payment Link"), 13, { url: payOnlineUrl });
    doc.setTextColor(60);
    ty += 14;
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

  if (invoice.notes) {
    ty += 8;
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);
    doc.text("Notes:", margin, ty);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(80);
    const lines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(lines, margin, ty + 12);
  }

  if (design?.footer) {
    const footerY = pageHeight - 30;
    doc.setFontSize(8);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(160);
    const footerLines = doc.splitTextToSize(design.footer, pageWidth - margin * 2);
    doc.text(footerLines, pageWidth / 2, footerY, { align: "center" });
  }

  const out = doc.output("arraybuffer");
  return Buffer.from(out);
}
