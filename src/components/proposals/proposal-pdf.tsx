"use client";

import * as React from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProposalData, ProposalDesign, ContentBlock } from "@/lib/types/proposals";
import { fmt } from "@/lib/types/proposals";

interface Props {
  proposal: ProposalData;
  projectName: string;
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  design?: ProposalDesign | null;
  contentBlocks?: ContentBlock[];
  previewMode?: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return [17, 24, 39];
  return [r, g, b];
}

async function loadImageBase64(
  url: string,
): Promise<{ data: string; format: "PNG" | "JPEG" } | null> {
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

async function resizePhotoForPdf(
  url: string,
  maxPtW: number,
  maxPtH: number,
): Promise<{ data: string; format: "PNG" | "JPEG"; ptW: number; ptH: number } | null> {
  const raw = await loadImageBase64(url);
  if (!raw) return null;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const ar = image.naturalWidth / image.naturalHeight;
      let ptW: number, ptH: number;
      if (ar >= maxPtW / maxPtH) {
        ptW = maxPtW;
        ptH = maxPtW / ar;
      } else {
        ptH = maxPtH;
        ptW = maxPtH * ar;
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
        const mime = raw.format === "PNG" ? "image/png" : "image/jpeg";
        const data = canvas.toDataURL(mime, 0.9);
        resolve({ data, format: raw.format, ptW, ptH });
      } else {
        resolve({ ...raw, ptW, ptH });
      }
    };
    image.onerror = () => resolve(null);
    image.src = raw.data;
  });
}

async function buildProposalPDF(props: Props): Promise<jsPDF> {
  const { proposal, projectName, companyName, companyEmail, companyPhone, design, contentBlocks } =
    props;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const primaryColor = design?.primaryColor ?? "#111827";
  const [pr, pg, pb] = hexToRgb(primaryColor);
  const titleFont = design?.titleFont ?? "helvetica";
  const bodyFont = design?.bodyFont ?? "helvetica";
  const footerReserve = design?.footer ? 50 : 30;

  doc.setFont(bodyFont, "normal");

  // helper to check remaining space and add page if needed
  function ensureSpace(needed: number, currentY: number): number {
    if (currentY + needed > pageHeight - footerReserve) {
      addFooter(doc, design, bodyFont, pageWidth, pageHeight, margin);
      doc.addPage();
      return margin;
    }
    return currentY;
  }

  // ── LEFT COLUMN: Logo → Company Name → Email → Phone ──
  let leftY = 36;
  if (design?.logoUrl) {
    const img = await resizeLogoForPdf(design.logoUrl, 120, 50);
    if (img) {
      try {
        doc.addImage(img.data, img.format, margin, leftY, img.ptW, img.ptH, undefined, "SLOW");
        leftY += img.ptH + 14;
      } catch {
        /* skip */
      }
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
  if (companyEmail) {
    doc.text(companyEmail, margin, leftY);
    leftY += 11;
  }
  if (companyPhone) {
    doc.text(companyPhone, margin, leftY);
    leftY += 11;
  }

  // ── RIGHT COLUMN: QUOTE header ──
  doc.setFontSize(26);
  doc.setFont(titleFont, "bold");
  doc.setTextColor(pr, pg, pb);
  doc.text("QUOTE", pageWidth - margin, 52, { align: "right" });
  doc.setFontSize(9);
  doc.setFont(bodyFont, "normal");
  doc.setTextColor(80);
  let rightY = 68;
  doc.text(`Date: ${new Date().toLocaleDateString("en-US")}`, pageWidth - margin, rightY, {
    align: "right",
  });
  rightY += 12;
  doc.text(`Valid until: ${proposal.validUntil}`, pageWidth - margin, rightY, { align: "right" });

  // ── Divider ──
  const dividerY = Math.max(leftY, rightY) + 14;
  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(1.5);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);

  // ── Prepared For ──
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

  // ── Scope ──
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

  // ── Line items table ──
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

  // ── Totals ──
  const grandTotal = proposal.lineItems.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0,
  );
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

  // ── Terms ──
  if (proposal.terms) {
    ty += 28;
    ty = ensureSpace(50, ty);
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

  // ── Interleaved Content Blocks (Notes + Images) ──
  const blocks = contentBlocks?.filter((b) => b.included) ?? [];
  if (blocks.length > 0) {
    ty += 24;
    ty = ensureSpace(30, ty);

    doc.setFontSize(9);
    doc.setFont(titleFont, "bold");
    doc.setTextColor(60);
    doc.text("PROJECT DOCUMENTATION", margin, ty);
    ty += 14;

    const contentWidth = pageWidth - margin * 2;

    const docNoteFs = 9;
    const docNoteLeading = 12;

    for (const block of blocks) {
      if (block.type === "note") {
        ty = ensureSpace(30, ty);
        doc.setFontSize(docNoteFs);
        doc.setFont(titleFont, "bold");
        doc.setTextColor(pr, pg, pb);
        doc.text("NOTE", margin, ty);
        ty += docNoteLeading;
        doc.setFontSize(docNoteFs);
        doc.setFont(bodyFont, "normal");
        doc.setTextColor(50);
        const noteLines = doc.splitTextToSize(block.content, contentWidth);
        const neededH = noteLines.length * docNoteLeading;
        ty = ensureSpace(neededH + 10, ty);
        doc.text(noteLines, margin, ty);
        ty += neededH + 8;
      } else if (block.type === "image" && block.imageUrl) {
        const maxImgW = contentWidth;
        const maxImgH = Math.round(200 * 1.3);
        const photo = await resizePhotoForPdf(block.imageUrl, maxImgW, maxImgH);
        if (photo) {
          let captionLinesH = 0;
          if (block.description?.trim()) {
            doc.setFontSize(docNoteFs);
            const capLines = doc.splitTextToSize(block.description.trim(), contentWidth);
            captionLinesH = capLines.length * docNoteLeading + 6;
          }
          ty = ensureSpace(photo.ptH + captionLinesH + 20, ty);
          try {
            doc.addImage(
              photo.data,
              photo.format,
              margin,
              ty,
              photo.ptW,
              photo.ptH,
              undefined,
              "SLOW",
            );
            ty += photo.ptH + 6;
          } catch {
            /* skip bad image */
          }
          if (block.description?.trim()) {
            doc.setFontSize(docNoteFs);
            doc.setFont(bodyFont, "normal");
            doc.setTextColor(80);
            const capLines = doc.splitTextToSize(block.description.trim(), contentWidth);
            doc.text(capLines, margin, ty);
            ty += capLines.length * docNoteLeading + 6;
          }
          ty += 8;
        }
      }
    }
  }

  // ── Footer on last page ──
  addFooter(doc, design, bodyFont, pageWidth, pageHeight, margin);

  return doc;
}

function addFooter(
  doc: jsPDF,
  design: ProposalDesign | null | undefined,
  bodyFont: string,
  pageWidth: number,
  pageHeight: number,
  margin: number,
) {
  if (design?.footer) {
    doc.setFontSize(8);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(160);
    const footerLines = doc.splitTextToSize(design.footer, pageWidth - margin * 2);
    doc.text(footerLines, pageWidth / 2, pageHeight - 30, { align: "center" });
  }
}

export function ProposalPdfButtons(props: Props) {
  const [generating, setGenerating] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (props.previewMode) {
      setGenerating(true);
      buildProposalPDF(props)
        .then((doc) => {
          const url = doc.output("bloburl") as unknown as string;
          setPreviewUrl(url);
        })
        .catch(() => toast.error("Failed to build PDF preview"))
        .finally(() => setGenerating(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.previewMode]);

  async function handleDownload() {
    setGenerating(true);
    try {
      const doc = await buildProposalPDF(props);
      const slug = props.projectName
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase()
        .slice(0, 40);
      doc.save(`quote-${slug}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  if (props.previewMode) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {generating ? (
          <div className="text-sm text-slate-400 animate-pulse">Building PDF preview...</div>
        ) : previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full rounded-lg border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <div className="text-sm text-slate-400">Failed to load preview</div>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() => void handleDownload()}
      disabled={generating}
    >
      <Download className="h-3.5 w-3.5" />
      {generating ? "Building..." : "Download PDF"}
    </Button>
  );
}
