"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import type { ProposalData, MediaItem } from "@/app/api/proposals/generate/route";

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
  mediaItems?: MediaItem[];
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

async function resizeLogoForPdf(
  url: string,
  maxPtW: number,
  maxPtH: number,
): Promise<{ data: string; format: "PNG" | "JPEG"; ptW: number; ptH: number } | null> {
  const raw = await loadImageBase64(url);
  if (!raw) return null;

  const scale = 3;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
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

async function generateProposalPDF({
  proposal,
  projectName,
  companyName,
  companyEmail,
  companyPhone,
  design,
  mediaItems,
}: Props) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const primaryColor = design?.primaryColor ?? "#111827";
  const [pr, pg, pb] = hexToRgb(primaryColor);
  const titleFont = design?.titleFont ?? "helvetica";
  const bodyFont = design?.bodyFont ?? "helvetica";

  doc.setFont(bodyFont, "normal");

  // ── LEFT COLUMN: Logo → Company Name → Email → Phone ─────────────────────
  let leftY = 36;

  if (design?.logoUrl) {
    const img = await resizeLogoForPdf(design.logoUrl, 120, 50);
    if (img) {
      try {
        doc.addImage(img.data, img.format, margin, leftY, img.ptW, img.ptH, undefined, "SLOW");
        leftY += img.ptH + 14; // gap between logo and company name
      } catch { /* skip bad image */ }
    }
  }

  doc.setFontSize(14);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text(companyName || "Your Company", margin, leftY);
  leftY += 14;

  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(90);
  if (companyEmail) { doc.text(companyEmail, margin, leftY); leftY += 11; }
  if (companyPhone) { doc.text(companyPhone, margin, leftY); leftY += 11; }

  // ── RIGHT COLUMN: QUOTE header ────────────────────────────────────────────
  doc.setFontSize(26);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("QUOTE", pageWidth - margin, 52, { align: "right" });

  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(80);
  let rightY = 68;
  doc.text(`Date: ${new Date().toLocaleDateString("en-US")}`, pageWidth - margin, rightY, { align: "right" });
  rightY += 12;
  doc.text(`Valid until: ${proposal.validUntil}`, pageWidth - margin, rightY, { align: "right" });

  // ── Divider (below tallest of left/right columns) ─────────────────────────
  const dividerY = Math.max(leftY, rightY) + 14;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1.5);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);

  // ── Prepared For ─────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("PREPARED FOR", margin, dividerY + 16);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(40);
  let y = dividerY + 28;
  doc.text(proposal.clientName, margin, y);
  y += 20;

  doc.setFontSize(13);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text(proposal.title, margin, y);
  y += 18;

  // ── Scope ─────────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(60);
  doc.text("SCOPE OF WORK", margin, y);
  y += 12;
  doc.setFont(bodyFont, "normal");
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
      fillColor: [pr, pg, pb],
      textColor: 255,
      fontSize: 9,
      fontStyle: "bold",
    },
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

  // ── Totals ────────────────────────────────────────────────────────────────
  const grandTotal = proposal.lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const col1 = pageWidth - margin - 80;
  const col2 = pageWidth - margin;
  let ty = finalY + 18;

  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.75);
  doc.line(col1 - 60, ty - 4, col2, ty - 4);

  doc.setFont(titleFont, "bold");
  doc.setFontSize(11);
  doc.setTextColor(pr, pg, pb);
  doc.text("TOTAL:", col1, ty + 8, { align: "right" });
  doc.text(fmt(grandTotal), col2, ty + 8, { align: "right" });

  // ── Terms ─────────────────────────────────────────────────────────────────
  if (proposal.terms) {
    ty += 28;
    doc.setFontSize(9);
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);
    doc.text("TERMS & CONDITIONS", margin, ty);
    ty += 12;
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(80);
    const termLines = doc.splitTextToSize(proposal.terms, pageWidth - margin * 2);
    doc.text(termLines, margin, ty);
    ty += termLines.length * 12;
  }

  // ── Project Photos ────────────────────────────────────────────────────────
  if (mediaItems && mediaItems.length > 0) {
    ty += 24;
    const maxImgW = (pageWidth - margin * 2 - 8) / 2; // 2 per row with gap
    const maxImgH = 160;
    const footerReserve = design?.footer ? 50 : 30;

    doc.setFontSize(9);
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);

    // Check if header + at least one image fits; if not, new page
    if (ty + 20 + maxImgH > pageHeight - footerReserve) {
      doc.addPage();
      ty = margin;
    }
    doc.text("PROJECT PHOTOS", margin, ty);
    ty += 14;

    let col = 0; // 0 = left, 1 = right
    for (const item of mediaItems) {
      const img = await loadImageBase64(item.signedUrl);
      if (!img) continue;

      // Compute display dimensions preserving aspect ratio
      let imgData = img.data;
      let ptW = maxImgW;
      let ptH = maxImgH;

      // Resize using canvas for consistent quality
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const ar = image.naturalWidth / image.naturalHeight;
          if (ar >= maxImgW / maxImgH) {
            ptW = maxImgW;
            ptH = maxImgW / ar;
          } else {
            ptH = maxImgH;
            ptW = maxImgH * ar;
          }
          const scale = 2;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(ptW * scale);
          canvas.height = Math.round(ptH * scale);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            const mime = img.format === "PNG" ? "image/png" : "image/jpeg";
            imgData = canvas.toDataURL(mime, 0.9);
          }
          resolve();
        };
        image.onerror = () => resolve();
        image.src = img.data;
      });

      const captionH = item.description ? 14 : 0;
      const rowH = ptH + captionH + 8; // image + caption + gap

      // If right column: x is margin + maxImgW + gap; ty stays from left column start
      const xPos = col === 0 ? margin : margin + maxImgW + 8;

      // For left column (start of a new row), check if row fits on page
      if (col === 0 && ty + rowH > pageHeight - footerReserve) {
        doc.addPage();
        ty = margin;
      }

      try {
        doc.addImage(imgData, img.format, xPos, ty, ptW, ptH, undefined, "SLOW");
      } catch { /* skip bad image */ }

      if (item.description) {
        doc.setFontSize(7);
        doc.setFont(bodyFont, "normal");
        doc.setTextColor(100);
        const captionLine = doc.splitTextToSize(item.description, maxImgW)[0] as string;
        doc.text(captionLine, xPos, ty + ptH + 9);
      }

      if (col === 0) {
        col = 1;
      } else {
        ty += rowH;
        col = 0;
      }
    }

    // If we ended on right column, advance ty
    if (col === 1) {
      ty += maxImgH + 14;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  if (design?.footer) {
    doc.setFontSize(8);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(160);
    const footerLines = doc.splitTextToSize(design.footer, pageWidth - margin * 2);
    doc.text(footerLines, pageWidth / 2, pageHeight - 30, { align: "center" });
  }

  const slug = projectName.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);
  doc.save(`quote-${slug}.pdf`);
}

export function ProposalDownloadButton({ proposal, projectName, companyName, companyEmail, companyPhone, design, mediaItems }: Props) {
  function handleClick() {
    generateProposalPDF({ proposal, projectName, companyName, companyEmail, companyPhone, design, mediaItems })
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
