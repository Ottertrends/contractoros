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
import type { InvoiceDesign } from "@/lib/types/database";

interface Props {
  userId: string;
  companyName: string;
  initialDesign: InvoiceDesign;
}

const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica — Clean & Modern" },
  { value: "times", label: "Times New Roman — Classic & Professional" },
  { value: "courier", label: "Courier — Technical / Typewriter" },
] as const;

const COLOR_PRESETS = [
  { label: "Slate", value: "#0f172a" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Emerald", value: "#065f46" },
  { label: "Violet", value: "#5b21b6" },
  { label: "Rose", value: "#9f1239" },
  { label: "Orange", value: "#9a3412" },
];

function hexToPreviewRgb(hex: string) {
  try {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    if (isNaN(r)) return "17, 24, 39";
    return `${r}, ${g}, ${b}`;
  } catch { return "17, 24, 39"; }
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
      // Bust cache with timestamp
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      setDesign((d) => ({ ...d, logoUrl: publicUrl }));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    setDesign((d) => ({ ...d, logoUrl: null }));
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
          invoice_font: design.font,
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

  const rgb = hexToPreviewRgb(design.primaryColor);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">Invoice Design</div>
        <div className="text-sm text-slate-500">
          Customize the look of all exported PDF invoices.
        </div>
      </div>

      {/* Logo */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Company Logo</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {design.logoUrl ? (
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={design.logoUrl}
                alt="Logo preview"
                className="h-16 max-w-[180px] object-contain rounded border border-slate-200 dark:border-slate-700 bg-white p-2"
              />
              <button
                onClick={removeLogo}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:underline mt-1"
              >
                <X className="w-3.5 h-3.5" /> Remove logo
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
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => fileInputRef.current?.click()}
            >
              Replace logo
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Brand Color</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-xs text-slate-500">
            Used for the invoice header bar, totals accent, and dividers.
          </div>

          {/* Presets */}
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

          {/* Custom hex */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
              style={{ backgroundColor: design.primaryColor }}
            />
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500">Custom color</Label>
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

      {/* Font */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Font</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {FONT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDesign((d) => ({ ...d, font: opt.value }))}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                design.font === opt.value
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                  design.font === opt.value ? "border-primary bg-primary" : "border-slate-300"
                }`}
              />
              <div>
                <div
                  className={`text-sm font-medium ${
                    design.font === opt.value
                      ? "text-primary"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {opt.label.split(" — ")[0]}
                </div>
                <div className="text-xs text-slate-400">{opt.label.split(" — ")[1]}</div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Footer message */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Footer Message</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-xs text-slate-500">
            Appears at the bottom of every PDF invoice (e.g. payment terms, thank-you note).
          </div>
          <Textarea
            value={design.footer ?? ""}
            onChange={(e) => setDesign((d) => ({ ...d, footer: e.target.value || null }))}
            placeholder="Thank you for your business! Payment is due within 30 days."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Live preview strip */}
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
                <img src={design.logoUrl} alt="logo" className="h-8 object-contain" />
              ) : (
                <div className="font-bold text-lg" style={{ fontFamily: design.font === "times" ? "serif" : design.font === "courier" ? "monospace" : "sans-serif" }}>
                  {companyName || "Your Company"}
                </div>
              )}
            </div>
            <div className="text-right opacity-90">
              <div className="text-xl font-bold tracking-wide" style={{ fontFamily: design.font === "times" ? "serif" : design.font === "courier" ? "monospace" : "sans-serif" }}>
                INVOICE
              </div>
              <div className="text-xs opacity-75 mt-0.5">#INV-0001</div>
            </div>
          </div>
          {design.footer && (
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
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
