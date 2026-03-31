"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import type { InvoiceDesign, InvoiceFont } from "@/lib/types/database";

interface Props {
  userId: string;
  companyName: string;
  initialDesign: InvoiceDesign;
}

const FONT_OPTIONS: { value: InvoiceFont; label: string; sub: string; css: string }[] = [
  { value: "helvetica", label: "Helvetica", sub: "Clean & Modern", css: "sans-serif" },
  { value: "times", label: "Times New Roman", sub: "Classic & Professional", css: "serif" },
  { value: "courier", label: "Courier", sub: "Technical / Typewriter", css: "monospace" },
];

const COLOR_PRESETS = [
  { label: "Slate", value: "#0f172a" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Emerald", value: "#065f46" },
  { label: "Violet", value: "#5b21b6" },
  { label: "Rose", value: "#9f1239" },
  { label: "Orange", value: "#9a3412" },
];

function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: InvoiceFont;
  onChange: (v: InvoiceFont) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</div>
      <div className="flex flex-col gap-2">
        {FONT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-left transition-all ${
              value === opt.value
                ? "border-primary bg-primary/5 dark:bg-slate-700/60"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                value === opt.value ? "border-primary bg-primary" : "border-slate-300 dark:border-slate-600"
              }`}
            />
            <div>
              <div
                style={{ fontFamily: opt.css }}
                className={`text-sm font-medium ${
                  value === opt.value
                    ? "text-primary dark:text-slate-100"
                    : "text-slate-800 dark:text-slate-200"
                }`}
              >
                {opt.label} — Aa Bb Cc
              </div>
              <div className="text-xs text-slate-400">{opt.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function InvoiceDesignClient({ userId, companyName, initialDesign }: Props) {
  const [design, setDesign] = useState<InvoiceDesign>(initialDesign);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${userId}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("invoice-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from("invoice-logos").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      setDesign((d) => ({ ...d, logoUrl: publicUrl }));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/invoice-design", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_logo_url: design.logoUrl,
          invoice_primary_color: design.primaryColor,
          invoice_title_font: design.titleFont,
          invoice_body_font: design.bodyFont,
          invoice_footer: design.footer,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Invoice design saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const titleCss = FONT_OPTIONS.find((f) => f.value === design.titleFont)?.css ?? "sans-serif";
  const bodyCss = FONT_OPTIONS.find((f) => f.value === design.bodyFont)?.css ?? "sans-serif";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">Document Design</div>
        <div className="text-sm text-slate-500">
          Customize the look of all exported PDF invoices.
        </div>
      </div>

      {/* Logo */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Company Logo</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Size recommendation */}
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs text-slate-500">
            <span className="mt-0.5 text-base leading-none">💡</span>
            <div>
              <span className="font-medium text-slate-700 dark:text-slate-300">Best size: 400 × 150 px</span>
              {" "}— PNG with transparent background works best.
              Images are automatically resized to fit the PDF header. Tall or square logos may appear smaller than wide ones.
            </div>
          </div>

          {design.logoUrl ? (
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={design.logoUrl}
                alt="Logo preview"
                className="h-16 max-w-[180px] object-contain rounded border border-slate-200 dark:border-slate-700 bg-white p-2"
              />
              <button
                onClick={() => setDesign((d) => ({ ...d, logoUrl: null }))}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:underline mt-1"
              >
                <X className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 cursor-pointer hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <Upload className="w-6 h-6 text-slate-400" />
              <div className="text-sm text-slate-500">
                {uploading ? "Uploading…" : "Click to upload logo"}
              </div>
              <div className="text-xs text-slate-400">PNG, JPG, WebP — max 2 MB</div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleLogoUpload(f);
              e.target.value = "";
            }}
          />
          {design.logoUrl && !uploading && (
            <Button variant="secondary" size="sm" className="w-fit" onClick={() => fileInputRef.current?.click()}>
              Replace logo
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Brand color */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Brand Color</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-xs text-slate-500">Used for the header bar, table headers, and total accent.</div>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDesign((d) => ({ ...d, primaryColor: p.value }))}
                title={p.label}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  design.primaryColor === p.value
                    ? "border-white ring-2 ring-offset-1 ring-slate-400 scale-110"
                    : "border-white/50 hover:scale-105"
                }`}
                style={{ backgroundColor: p.value }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
              style={{ backgroundColor: design.primaryColor }}
            />
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500">Custom hex</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={design.primaryColor}
                  onChange={(e) => setDesign((d) => ({ ...d, primaryColor: e.target.value }))}
                  className="h-8 w-10 rounded border border-slate-200 cursor-pointer p-0.5"
                />
                <Input
                  value={design.primaryColor}
                  onChange={(e) => setDesign((d) => ({ ...d, primaryColor: e.target.value }))}
                  placeholder="#111827"
                  className="w-28 h-8 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fonts — two pickers side by side */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Fonts</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <FontPicker
            label="Title / Headings font"
            value={design.titleFont}
            onChange={(v) => setDesign((d) => ({ ...d, titleFont: v }))}
          />
          <FontPicker
            label="Body / Content font"
            value={design.bodyFont}
            onChange={(v) => setDesign((d) => ({ ...d, bodyFont: v }))}
          />
        </CardContent>
      </Card>

      {/* Footer */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Footer Message</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-xs text-slate-500">
            Printed at the bottom of every PDF (e.g. payment terms, thank-you note).
          </div>
          <Textarea
            value={design.footer ?? ""}
            onChange={(e) => setDesign((d) => ({ ...d, footer: e.target.value || null }))}
            placeholder="Thank you for your business! Payment due within 30 days."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card className="overflow-hidden">
        <CardHeader><CardTitle className="text-sm">Preview</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div
            className="px-6 py-4 text-white flex items-center justify-between"
            style={{ backgroundColor: design.primaryColor }}
          >
            <div>
              {design.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={design.logoUrl} alt="logo" className="h-10 object-contain" />
              ) : (
                <div className="font-bold text-lg" style={{ fontFamily: titleCss }}>
                  {companyName || "Your Company"}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold tracking-wide" style={{ fontFamily: titleCss }}>
                INVOICE
              </div>
              <div className="text-xs opacity-75 mt-0.5" style={{ fontFamily: bodyCss }}>
                #INV-0001 · {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="px-6 py-4 bg-white dark:bg-slate-950" style={{ fontFamily: bodyCss }}>
            <div className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-semibold">Bill To</div>
            <div className="text-sm text-slate-700 dark:text-slate-300">Client Name</div>
            <div className="text-xs text-slate-400">123 Main Street</div>
          </div>
          {design.footer && (
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800" style={{ fontFamily: bodyCss }}>
              {design.footer}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Design"}
        </Button>
      </div>
    </div>
  );
}
