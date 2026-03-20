"use client";

import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { InvoiceStatus, Project } from "@/lib/types/database";

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
  items: LineItem[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function generatePDF({ invoice, project, profile, items }: Props) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header: company name
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(profile?.company_name ?? "Your Company", margin, 60);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const contactLine = [profile?.phone, profile?.email].filter(Boolean).join("  |  ");
  if (contactLine) doc.text(contactLine, margin, 76);

  // INVOICE label + meta (right side)
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30);
  doc.text("INVOICE", pageWidth - margin, 60, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  const dateStr = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString("en-US")
    : new Date().toLocaleDateString("en-US");
  doc.text(`Invoice #: ${invoice.invoice_number ?? "—"}`, pageWidth - margin, 76, { align: "right" });
  doc.text(`Date: ${dateStr}`, pageWidth - margin, 88, { align: "right" });
  doc.text(`Status: ${invoice.status.toUpperCase()}`, pageWidth - margin, 100, { align: "right" });

  // Divider
  doc.setDrawColor(200);
  doc.line(margin, 108, pageWidth - margin, 108);

  // Bill To
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30);
  doc.text("Bill To:", margin, 124);
  doc.setFont("helvetica", "normal");
  let y = 136;
  if (project?.client_name) { doc.text(project.client_name, margin, y); y += 12; }
  if (project?.address) { doc.text(project.address, margin, y); y += 12; }
  const cityLine = [project?.city, project?.state, project?.zip].filter(Boolean).join(", ");
  if (cityLine) { doc.text(cityLine, margin, y); y += 12; }

  if (project?.name) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text(`Project: ${project.name}`, margin, y);
    y += 6;
  }

  // Line items table
  const tableBody = items.map((it) => [
    it.description,
    String(parseFloat(it.quantity) || 0),
    fmt(parseFloat(it.unit_price) || 0),
    fmt(parseFloat(it.total) || 0),
  ]);

  autoTable(doc, {
    startY: y + 10,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 70, halign: "right" },
      3: { cellWidth: 70, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 60;

  // Totals
  const col1 = pageWidth - margin - 70;
  const col2 = pageWidth - margin;
  let ty = finalY + 16;

  const subtotal = parseFloat(invoice.subtotal) || 0;
  const taxRate = parseFloat(invoice.tax_rate) || 0;
  const taxAmount = parseFloat(invoice.tax_amount) || 0;
  const total = parseFloat(invoice.total) || 0;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);

  doc.text("Subtotal:", col1, ty, { align: "right" });
  doc.text(fmt(subtotal), col2, ty, { align: "right" });
  ty += 14;

  if (taxRate > 0) {
    doc.text(`Tax (${taxRate}%):`, col1, ty, { align: "right" });
    doc.text(fmt(taxAmount), col2, ty, { align: "right" });
    ty += 14;
  }

  doc.setDrawColor(180);
  doc.line(col1 - 60, ty - 4, col2, ty - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text("TOTAL:", col1, ty + 8, { align: "right" });
  doc.text(fmt(total), col2, ty + 8, { align: "right" });

  if (invoice.notes) {
    ty += 30;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(40);
    doc.text("Notes:", margin, ty);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(lines, margin, ty + 12);
  }

  const filename = `invoice-${invoice.invoice_number ?? "draft"}.pdf`;
  doc.save(filename);
}

export function PdfExportButton({ invoice, project, profile, items }: Props) {
  function handleClick() {
    try {
      generatePDF({ invoice, project, profile, items });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
    >
      Export PDF
    </button>
  );
}
