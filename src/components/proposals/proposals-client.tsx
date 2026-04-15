"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Search,
  ChevronDown,
  Plus,
  Trash2,

  Eye,
  EyeOff,
  Save,
  Share2,
  Mail,
  FileText,
  Clock,
  Copy,
  Loader2,
  ArrowLeft,
  X,
  ChevronUp,
  BookTemplate,
} from "lucide-react";

import { useLanguage } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

import type {
  ProposalData,
  ProposalDesign,
  ContentBlock,
  ProposalLineItem,
  ProposalTemplate,
  GenerateResult,
  ProposalStatus,
} from "@/lib/types/proposals";
import { fmt } from "@/lib/types/proposals";

const ProposalPdfButtons = dynamic(
  () => import("./proposal-pdf").then((m) => m.ProposalPdfButtons),
  { ssr: false },
);

/* ─── Types ─────────────────────────────────────────────────────── */

interface Project {
  id: string;
  name: string | null;
  client_name?: string | null;
  status?: string | null;
}

interface SavedProposalSummary {
  id: string;
  project_id: string;
  title: string;
  client_name: string | null;
  project_name: string | null;
  status: ProposalStatus;
  valid_until: string | null;
  line_items: ProposalLineItem[];
  created_at: string;
  updated_at: string;
}

interface Props {
  projects: Project[];
  initialTemplates: ProposalTemplate[];
}

type Tab = "generate" | "history";
type Step = "idle" | "fetching" | "thinking" | "preparing" | "done";

const STEP_LABELS: Record<Step, string> = {
  idle: "",
  fetching: "Loading project data...",
  thinking: "AI is generating your quote...",
  preparing: "Preparing content blocks...",
  done: "Done!",
};

/* ─── Main Component ─────────────────────────────────────────── */

export function ProposalsClient({ projects, initialTemplates }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = React.useState<Tab>("generate");

  /* ── Generate tab state ── */
  const [selectedId, setSelectedId] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const selectorRef = React.useRef<HTMLDivElement>(null);

  const [mode, setMode] = React.useState<"strict" | "custom">("strict");
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [formValidUntil, setFormValidUntil] = React.useState(defaultValidUntil);
  const [formTerms, setFormTerms] = React.useState("");
  const [formScope, setFormScope] = React.useState("");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");

  const [step, setStep] = React.useState<Step>("idle");
  const [result, setResult] = React.useState<GenerateResult | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);

  /* ── History tab state ── */
  const [history, setHistory] = React.useState<SavedProposalSummary[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  /* ── Templates ── */
  const [templates, setTemplates] = React.useState<ProposalTemplate[]>(initialTemplates);
  const [showTemplateSave, setShowTemplateSave] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");

  /* ── Share / Email dialogs ── */
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [showEmailDialog, setShowEmailDialog] = React.useState(false);
  const [emailTo, setEmailTo] = React.useState("");
  const [emailSending, setEmailSending] = React.useState(false);

  /* ── PDF preview ── */
  const [showPdfPreview, setShowPdfPreview] = React.useState(false);

  /* ── Computed ── */
  const selectedProject = projects.find((p) => p.id === selectedId);
  const filteredProjects = projects.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.name ?? "").toLowerCase().includes(q) ||
      (p.client_name ?? "").toLowerCase().includes(q)
    );
  });

  /* ── Close selector on outside click ── */
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* ── Load history when tab switches ── */
  React.useEffect(() => {
    if (tab === "history" && history.length === 0) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/proposals/list");
      const data = await res.json();
      setHistory(data.proposals ?? []);
    } catch {
      toast.error("Failed to load proposal history");
    } finally {
      setHistoryLoading(false);
    }
  }

  /* ── Apply template ── */
  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const tpl = templates.find((tpl) => tpl.id === id);
    if (!tpl) return;
    if (tpl.scope_template) setFormScope(tpl.scope_template);
    if (tpl.terms_template) setFormTerms(tpl.terms_template);
    toast.success(`${t.toasts.templateApplied}: "${tpl.name}"`);
  }

  /* ── Save current scope/terms as template ── */
  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    try {
      const res = await fetch("/api/proposals/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          scopeTemplate: formScope.trim() || null,
          termsTemplate: formTerms.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.template) {
        setTemplates((prev) => [...prev, data.template]);
        toast.success(t.toasts.templateSaved);
      }
    } catch {
      toast.error(t.toasts.failed);
    } finally {
      setShowTemplateSave(false);
      setTemplateName("");
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await fetch("/api/proposals/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedTemplateId === id) setSelectedTemplateId("");
      toast.success(t.toasts.templateDeleted);
    } catch {
      toast.error(t.toasts.failed);
    }
  }

  /* ── Generate quote ── */
  async function handleGenerate() {
    if (!selectedId) {
      toast.error("Please select a project first");
      return;
    }
    setStep("fetching");
    setResult(null);
    setSavedId(null);
    try {
      setStep("thinking");
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedId,
          mode,
          customInstructions: mode === "custom" ? customInstructions : undefined,
          validUntil: formValidUntil || undefined,
          terms: formTerms.trim() || undefined,
          scope: formScope.trim() || undefined,
        }),
      });
      setStep("preparing");
      const data = await res.json();
      if (!res.ok || !data.proposal) throw new Error(data.error ?? "Generation failed");
      setResult({
        proposal: data.proposal,
        projectName: data.projectName ?? "proposal",
        companyName: data.companyName ?? "",
        companyEmail: data.companyEmail ?? "",
        companyPhone: data.companyPhone ?? "",
        design: data.design ?? null,
        contentBlocks: data.contentBlocks ?? [],
      });
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.toasts.failed);
      setStep("idle");
    }
  }

  /* ── Save proposal ── */
  async function handleSave() {
    if (!result) return;
    try {
      const endpoint = savedId ? `/api/proposals/${savedId}` : "/api/proposals/save";
      const method = savedId ? "PUT" : "POST";
      const body = savedId
        ? {
            title: result.proposal.title,
            clientName: result.proposal.clientName,
            scope: result.proposal.scope,
            terms: result.proposal.terms,
            validUntil: result.proposal.validUntil,
            lineItems: result.proposal.lineItems,
            contentBlocks: result.contentBlocks,
          }
        : {
            projectId: selectedId,
            title: result.proposal.title,
            clientName: result.proposal.clientName,
            scope: result.proposal.scope,
            terms: result.proposal.terms,
            validUntil: result.proposal.validUntil,
            lineItems: result.proposal.lineItems,
            contentBlocks: result.contentBlocks,
            companyName: result.companyName,
            companyEmail: result.companyEmail,
            companyPhone: result.companyPhone,
            projectName: result.projectName,
            design: result.design,
          };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.id) setSavedId(data.id);
      toast.success(savedId ? t.toasts.proposalUpdated : t.toasts.proposalSaved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.toasts.failed);
    }
  }

  /* ── Share ── */
  async function handleShare() {
    if (!savedId) {
      toast.error("Save the proposal first to generate a share link");
      return;
    }
    try {
      const res = await fetch("/api/proposals/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: savedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const url = `${window.location.origin}/proposal/${data.shareToken}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success(t.toasts.proposalShareCopied);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.toasts.failed);
    }
  }

  /* ── Email ── */
  async function handleEmail() {
    if (!savedId || !emailTo.trim()) return;
    setEmailSending(true);
    try {
      if (!shareUrl) {
        const shareRes = await fetch("/api/proposals/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: savedId }),
        });
        const shareData = await shareRes.json();
        if (!shareRes.ok) throw new Error(shareData.error);
        const url = `${window.location.origin}/proposal/${shareData.shareToken}`;
        setShareUrl(url);

        const res = await fetch("/api/proposals/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: savedId, recipientEmail: emailTo.trim(), shareUrl: url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        const res = await fetch("/api/proposals/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: savedId, recipientEmail: emailTo.trim(), shareUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }
      toast.success(`${t.toasts.proposalEmailSent} ${emailTo}`);
      setShowEmailDialog(false);
      setEmailTo("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  /* ── Load saved proposal into editor ── */
  async function loadSavedProposal(id: string) {
    try {
      const res = await fetch(`/api/proposals/${id}`);
      const data = await res.json();
      if (!res.ok || !data.proposal) throw new Error(data.error ?? "Not found");
      const p = data.proposal;
      setResult({
        proposal: {
          title: p.title,
          clientName: p.client_name ?? "Client",
          scope: p.scope ?? "",
          lineItems: p.line_items ?? [],
          terms: p.terms ?? "",
          validUntil: p.valid_until ?? "",
        },
        projectName: p.project_name ?? "",
        companyName: p.company_name ?? "",
        companyEmail: p.company_email ?? "",
        companyPhone: p.company_phone ?? "",
        design: p.design ?? null,
        contentBlocks: p.content_blocks ?? [],
      });
      setSavedId(id);
      setSelectedId(p.project_id);
      setStep("done");
      setTab("generate");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load proposal");
    }
  }

  /* ── Delete saved proposal ── */
  async function handleDeleteProposal(id: string) {
    try {
      const res = await fetch(`/api/proposals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setHistory((prev) => prev.filter((p) => p.id !== id));
      toast.success(t.toasts.proposalDeleted);
    } catch {
      toast.error(t.toasts.failed);
    }
  }

  /* ── Editing helpers ── */
  function updateProposal(patch: Partial<ProposalData>) {
    if (!result) return;
    setResult({ ...result, proposal: { ...result.proposal, ...patch } });
  }

  function updateLineItem(idx: number, patch: Partial<ProposalLineItem>) {
    if (!result) return;
    const items = [...result.proposal.lineItems];
    items[idx] = { ...items[idx], ...patch };
    updateProposal({ lineItems: items });
  }

  function removeLineItem(idx: number) {
    if (!result) return;
    updateProposal({ lineItems: result.proposal.lineItems.filter((_, i) => i !== idx) });
  }

  function addLineItem() {
    if (!result) return;
    updateProposal({
      lineItems: [...result.proposal.lineItems, { description: "", qty: 1, unitPrice: 0 }],
    });
  }

  function moveLineItem(idx: number, dir: -1 | 1) {
    if (!result) return;
    const items = [...result.proposal.lineItems];
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    [items[idx], items[target]] = [items[target], items[idx]];
    updateProposal({ lineItems: items });
  }

  function toggleContentBlock(idx: number) {
    if (!result) return;
    const blocks = [...result.contentBlocks];
    blocks[idx] = { ...blocks[idx], included: !blocks[idx].included };
    setResult({ ...result, contentBlocks: blocks });
  }

  const loading = step !== "idle" && step !== "done";

  /* ─────────────────────────────────────── RENDER ───────────── */
  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-slate-100 dark:bg-slate-900 p-1 w-fit">
        <button
          onClick={() => setTab("generate")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === "generate"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <FileText className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
          Generate
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === "history"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Clock className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
          History
        </button>
      </div>

      {/* ══════════ GENERATE TAB ══════════ */}
      {tab === "generate" && (
        <>
          {/* Form card (hidden after result to save space, but accessible) */}
          {!result ? (
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Generate Quote
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Select a project and let AI generate a professional quote PDF using your project
                  notes, media, and billing history.
                </p>
              </div>

              {/* ── Searchable project selector ── */}
              <div ref={selectorRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectorOpen(!selectorOpen)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <span className={selectedProject ? "text-slate-900 dark:text-white" : "text-slate-400"}>
                    {selectedProject
                      ? `${selectedProject.name ?? "Untitled"}${selectedProject.client_name ? ` · ${selectedProject.client_name}` : ""}`
                      : "— Select a project —"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>

                {selectorOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-lg">
                    <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search projects..."
                        className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                        autoFocus
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")}>
                          <X className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                      {filteredProjects.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-400 text-center">
                          No projects found
                        </p>
                      ) : (
                        filteredProjects.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedId(p.id);
                              setSelectorOpen(false);
                              setSearchQuery("");
                              setResult(null);
                              setSavedId(null);
                            }}
                            className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                              p.id === selectedId
                                ? "bg-slate-100 dark:bg-slate-800"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            }`}
                          >
                            <div className="font-medium text-slate-900 dark:text-white">
                              {p.name ?? "Untitled"}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.client_name && (
                                <span className="text-xs text-slate-500">{p.client_name}</span>
                              )}
                              {p.status && (
                                <Badge
                                  variant={
                                    p.status === "active"
                                      ? "success"
                                      : p.status === "completed"
                                        ? "default"
                                        : "secondary"
                                  }
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {p.status}
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Selected project card ── */}
              {selectedProject && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {selectedProject.name ?? "Untitled"}
                      </p>
                      {selectedProject.client_name && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Client: {selectedProject.client_name}
                        </p>
                      )}
                    </div>
                    {selectedProject.status && (
                      <Badge
                        variant={
                          selectedProject.status === "active"
                            ? "success"
                            : selectedProject.status === "completed"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {selectedProject.status}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {projects.length === 0 && (
                <p className="text-sm text-slate-400">
                  No projects found. Create a project first via WhatsApp or the Projects page.
                </p>
              )}

              {/* ── Template selector ── */}
              {templates.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">
                    <BookTemplate className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                    Apply a template
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t) => (
                      <div key={t.id} className="flex items-center gap-1">
                        <button
                          onClick={() => applyTemplate(t.id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            selectedTemplateId === t.id
                              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {t.name}
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Document settings ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">Document settings (optional)</p>
                  <button
                    onClick={() => setShowTemplateSave(true)}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    <Save className="inline w-3 h-3 mr-1 -mt-0.5" />
                    Save as template
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Valid until</label>
                    <input
                      type="date"
                      value={formValidUntil}
                      onChange={(e) => setFormValidUntil(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      Scope of work{" "}
                      <span className="text-slate-400">(overrides AI)</span>
                    </label>
                    <textarea
                      value={formScope}
                      onChange={(e) => setFormScope(e.target.value)}
                      placeholder="Describe the scope — leave blank for AI to generate from project notes"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">
                    Terms & conditions{" "}
                    <span className="text-slate-400">(overrides AI)</span>
                  </label>
                  <textarea
                    value={formTerms}
                    onChange={(e) => setFormTerms(e.target.value)}
                    placeholder="e.g. Payment is 50% upfront, 50% on completion. Work guaranteed for 1 year. — leave blank for AI to generate"
                    rows={2}
                    className="w-full rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  />
                </div>
              </div>

              {/* ── Mode selector ── */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Generation mode</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(["strict", "custom"] as const).map((m) => (
                    <label
                      key={m}
                      className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                        mode === m
                          ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-900"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="mode"
                          value={m}
                          checked={mode === m}
                          onChange={() => setMode(m)}
                          className="accent-slate-900 dark:accent-white"
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 capitalize">
                          {m}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 pl-5">
                        {m === "strict"
                          ? "Claude uses only the data you have uploaded — no inferred prices or invented line items."
                          : "Add your own instructions, T&Cs, or scope for Claude to polish the document."}
                      </p>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Custom instructions ── */}
              {mode === "custom" && (
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">
                    Your instructions / T&Cs / scope
                  </label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Payment is 50% upfront, 50% on completion. All work is guaranteed for 1 year. Include a mobilization fee of $500..."
                    rows={4}
                    className="w-full rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  />
                </div>
              )}

              {/* ── Generate button + progress ── */}
              <div className="flex items-center gap-3">
                <Button onClick={() => void handleGenerate()} disabled={loading || !selectedId}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {STEP_LABELS[step]}
                    </>
                  ) : (
                    "Generate Quote"
                  )}
                </Button>
                {loading && (
                  <div className="flex items-center gap-2">
                    {(["fetching", "thinking", "preparing"] as Step[]).map((s, i) => (
                      <div
                        key={s}
                        className={`h-1.5 w-8 rounded-full transition-colors ${
                          ["fetching", "thinking", "preparing"].indexOf(step) >= i
                            ? "bg-slate-900 dark:bg-white"
                            : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ════════ RESULT / EDITOR ════════ */
            <div className="space-y-4">
              {/* Back button + action bar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={() => {
                    setResult(null);
                    setStep("idle");
                    setSavedId(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to form
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="secondary" size="sm" onClick={() => void handleSave()}>
                    <Save className="h-3.5 w-3.5" />
                    {savedId ? "Update" : "Save"}
                  </Button>
                  {savedId && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => void handleShare()}>
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowEmailDialog(true)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email
                      </Button>
                    </>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setShowPdfPreview(true)}>
                    <Eye className="h-3.5 w-3.5" />
                    Preview PDF
                  </Button>
                  <ProposalPdfButtons
                    proposal={result.proposal}
                    projectName={result.projectName}
                    companyName={result.companyName}
                    companyEmail={result.companyEmail}
                    companyPhone={result.companyPhone}
                    design={result.design}
                    contentBlocks={result.contentBlocks.filter((b) => b.included)}
                  />
                </div>
              </div>

              {/* Share URL display */}
              {shareUrl && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-sm">
                  <Share2 className="h-4 w-4 text-green-600 shrink-0" />
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-transparent text-green-800 dark:text-green-300 text-xs outline-none truncate"
                  />
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(shareUrl);
                      toast.success(t.toasts.copied);
                    }}
                    className="text-green-600 hover:text-green-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Editor card */}
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 space-y-6">
                {/* Title + client (editable) */}
                <div>
                  <input
                    value={result.proposal.title}
                    onChange={(e) => updateProposal({ title: e.target.value })}
                    className="w-full text-lg font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-slate-400 outline-none pb-1 transition-colors"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-slate-500">Prepared for:</span>
                    <input
                      value={result.proposal.clientName}
                      onChange={(e) => updateProposal({ clientName: e.target.value })}
                      className="text-sm text-slate-700 dark:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-slate-400 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Scope (editable) */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                    Scope of Work
                  </p>
                  <textarea
                    value={result.proposal.scope}
                    onChange={(e) => updateProposal({ scope: e.target.value })}
                    rows={4}
                    className="w-full text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-transparent border border-transparent rounded-md px-2 py-1.5 hover:border-slate-200 dark:hover:border-slate-700 focus:border-slate-400 outline-none resize-y transition-colors"
                  />
                </div>

                {/* Line items (editable) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Line Items
                    </p>
                    <Button variant="ghost" size="sm" onClick={addLineItem}>
                      <Plus className="h-3.5 w-3.5" />
                      Add item
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-slate-500 text-xs uppercase tracking-wide">
                          <th className="pb-2 font-medium w-6" />
                          <th className="pb-2 font-medium">Description</th>
                          <th className="pb-2 font-medium text-right w-20">Qty</th>
                          <th className="pb-2 font-medium text-right w-28">Unit Price</th>
                          <th className="pb-2 font-medium text-right w-24">Total</th>
                          <th className="pb-2 w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {result.proposal.lineItems.map((item, i) => (
                          <tr
                            key={i}
                            className="border-b border-slate-50 dark:border-slate-900 group"
                          >
                            <td className="py-1.5">
                              <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => moveLineItem(i, -1)}
                                  disabled={i === 0}
                                  className="text-slate-300 hover:text-slate-500 disabled:invisible"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => moveLineItem(i, 1)}
                                  disabled={i === result.proposal.lineItems.length - 1}
                                  className="text-slate-300 hover:text-slate-500 disabled:invisible"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5">
                              <input
                                value={item.description}
                                onChange={(e) =>
                                  updateLineItem(i, { description: e.target.value })
                                }
                                className="w-full text-sm text-slate-700 dark:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 outline-none transition-colors"
                              />
                            </td>
                            <td className="py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={item.qty}
                                onChange={(e) =>
                                  updateLineItem(i, { qty: parseFloat(e.target.value) || 0 })
                                }
                                className="w-16 text-right text-sm text-slate-500 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 outline-none transition-colors"
                              />
                            </td>
                            <td className="py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateLineItem(i, {
                                    unitPrice: parseFloat(e.target.value) || 0,
                                  })
                                }
                                className="w-24 text-right text-sm text-slate-500 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 outline-none transition-colors"
                              />
                            </td>
                            <td className="py-1.5 text-right font-medium text-slate-800 dark:text-slate-200">
                              {fmt(item.qty * item.unitPrice)}
                            </td>
                            <td className="py-1.5 text-right">
                              <button
                                onClick={() => removeLineItem(i)}
                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td />
                          <td colSpan={3} className="pt-3 text-right font-bold text-slate-900 dark:text-white pr-4">
                            Total
                          </td>
                          <td className="pt-3 text-right font-bold text-slate-900 dark:text-white">
                            {fmt(
                              result.proposal.lineItems.reduce(
                                (s, i) => s + i.qty * i.unitPrice,
                                0,
                              ),
                            )}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Terms (editable) */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                    Terms
                  </p>
                  <textarea
                    value={result.proposal.terms}
                    onChange={(e) => updateProposal({ terms: e.target.value })}
                    rows={3}
                    className="w-full text-sm text-slate-600 dark:text-slate-400 bg-transparent border border-transparent rounded-md px-2 py-1.5 hover:border-slate-200 dark:hover:border-slate-700 focus:border-slate-400 outline-none resize-y transition-colors"
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400">Valid until:</span>
                    <input
                      type="date"
                      value={result.proposal.validUntil}
                      onChange={(e) => updateProposal({ validUntil: e.target.value })}
                      className="text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-slate-400 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Content blocks (interleaved notes + images) */}
                {result.contentBlocks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
                      Project Documentation
                    </p>
                    <div className="space-y-3">
                      {result.contentBlocks.map((block, i) => (
                        <div
                          key={i}
                          className={`flex gap-3 rounded-lg border p-3 transition-colors ${
                            block.included
                              ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                              : "border-slate-100 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/50 opacity-50"
                          }`}
                        >
                          <button
                            onClick={() => toggleContentBlock(i)}
                            className="shrink-0 mt-0.5"
                            title={block.included ? "Exclude from proposal" : "Include in proposal"}
                          >
                            {block.included ? (
                              <Eye className="h-4 w-4 text-green-500" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-slate-300" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            {block.type === "note" ? (
                              <div>
                                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                                  Note
                                </p>
                                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                  {block.content}
                                </p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                  Image
                                </p>
                                {block.imageUrl && (
                                  <img
                                    src={block.imageUrl}
                                    alt={block.description ?? "Project image"}
                                    className="rounded-md max-h-[15.6rem] w-auto max-w-full object-contain border border-slate-100 dark:border-slate-800"
                                  />
                                )}
                                {block.description && (
                                  <p className="text-sm mt-2 text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                                    {block.description}
                                  </p>
                                )}
                              </div>
                            )}
                            <p className="text-sm text-slate-400 mt-2">
                              {new Date(block.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PDF Preview Dialog ── */}
          {showPdfPreview && result && (
            <Dialog open={showPdfPreview} onOpenChange={setShowPdfPreview}>
              <DialogContent className="max-w-4xl h-[85vh]">
                <DialogHeader>
                  <DialogTitle>PDF Preview</DialogTitle>
                  <DialogDescription>Preview of your quote document</DialogDescription>
                </DialogHeader>
                <div className="flex-1 min-h-0">
                  <ProposalPdfButtons
                    proposal={result.proposal}
                    projectName={result.projectName}
                    companyName={result.companyName}
                    companyEmail={result.companyEmail}
                    companyPhone={result.companyPhone}
                    design={result.design}
                    contentBlocks={result.contentBlocks.filter((b) => b.included)}
                    previewMode
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* ── Save Template Dialog ── */}
          <Dialog open={showTemplateSave} onOpenChange={setShowTemplateSave}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save as Template</DialogTitle>
                <DialogDescription>
                  Save current scope and terms as a reusable template.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Template name
                  </label>
                  <input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Standard Residential"
                    className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
                {formScope && (
                  <p className="text-xs text-slate-400 truncate">
                    Scope: {formScope.slice(0, 80)}...
                  </p>
                )}
                {formTerms && (
                  <p className="text-xs text-slate-400 truncate">
                    Terms: {formTerms.slice(0, 80)}...
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setShowTemplateSave(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSaveTemplate()} disabled={!templateName.trim()}>
                  Save Template
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── Email Dialog ── */}
          <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Email Quote</DialogTitle>
                <DialogDescription>
                  Send this quote to your client via email.
                </DialogDescription>
              </DialogHeader>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Recipient email
                </label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="client@example.com"
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setShowEmailDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleEmail()}
                  disabled={emailSending || !emailTo.trim()}
                >
                  {emailSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      Send Email
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ══════════ HISTORY TAB ══════════ */}
      {tab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
            Saved Proposals
          </h2>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((k) => (
                <Skeleton key={k} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No saved proposals yet. Generate and save a quote to see it here.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((p) => {
                const total = (p.line_items ?? []).reduce(
                  (s: number, li: ProposalLineItem) => s + li.qty * li.unitPrice,
                  0,
                );
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group"
                  >
                    <button
                      onClick={() => void loadSavedProposal(p.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {p.title}
                        </p>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {p.client_name && (
                          <span className="text-xs text-slate-500">{p.client_name}</span>
                        )}
                        {p.project_name && (
                          <span className="text-xs text-slate-400">{p.project_name}</span>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                        {total > 0 && (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {fmt(total)}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => void handleDeleteProposal(p.id)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function defaultValidUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const map: Record<ProposalStatus, { label: string; variant: "secondary" | "success" | "warning" | "danger" }> = {
    draft: { label: "Draft", variant: "secondary" },
    sent: { label: "Sent", variant: "warning" },
    accepted: { label: "Accepted", variant: "success" },
    rejected: { label: "Rejected", variant: "danger" },
  };
  const cfg = map[status] ?? map.draft;
  return (
    <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">
      {cfg.label}
    </Badge>
  );
}
