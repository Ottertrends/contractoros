"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectMedia } from "@/lib/types/database";

export type MediaWithUrl = ProjectMedia & { signedUrl: string | null };

function Lightbox({ item, onClose }: { item: MediaWithUrl; onClose: () => void }) {
  if (!item.signedUrl) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-slate-300"
        onClick={onClose}
      >
        ×
      </button>
      <div className="max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
        {item.media_type === "video" ? (
          <video
            src={item.signedUrl}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full rounded-lg"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.signedUrl}
            alt={item.description ?? "Project photo"}
            className="max-h-[80vh] max-w-full rounded-lg"
          />
        )}
        {item.description && (
          <p className="mt-2 text-white text-sm text-center">{item.description}</p>
        )}
        <p className="mt-1 text-slate-400 text-xs text-center">
          {new Date(item.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

function MediaThumb({
  item,
  projectId,
  onOpenLightbox,
  onDelete,
  onCaptionSaved,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  item: MediaWithUrl;
  projectId: string;
  onOpenLightbox: () => void;
  onDelete: () => void;
  onCaptionSaved: (id: string, caption: string) => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionVal, setCaptionVal] = useState(item.description ?? "");
  const [savingCaption, setSavingCaption] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!item.signedUrl) return null;

  async function saveCaption() {
    setSavingCaption(true);
    try {
      await fetch(`/api/projects/${projectId}/media/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: captionVal.trim() || null }),
      });
      onCaptionSaved(item.id, captionVal.trim());
    } finally {
      setSavingCaption(false);
      setEditingCaption(false);
    }
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setCaptionVal(item.description ?? "");
    setEditingCaption(true);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = (item.description ?? "").length;
      el.setSelectionRange(len, len);
    }, 0);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`group flex flex-col rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-opacity ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
    >
      {/* Image / video area */}
      <div className="relative aspect-square bg-slate-100 dark:bg-slate-800 shrink-0">
        {/* Drag handle */}
        <div
          className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing bg-black/55 rounded-md px-1.5 py-1 shadow-sm"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden>
            <path d="M8 6h8M8 12h8M8 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white text-base leading-none hover:bg-red-600"
          title="Delete"
        >
          ×
        </button>

        <div className="cursor-pointer w-full h-full" onClick={onOpenLightbox}>
          {item.media_type === "video" ? (
            <video
              src={item.signedUrl}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.signedUrl}
              alt={item.description ?? "Project photo"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {item.media_type === "video" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/50 rounded-full p-2">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Caption zone — always below the image so editing is obvious */}
      <div
        className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/90 px-3 py-3 sm:py-3.5 min-h-[5.5rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
          Caption
        </p>
        {editingCaption ? (
          <>
            <textarea
              ref={textareaRef}
              autoFocus
              value={captionVal}
              onChange={(e) => setCaptionVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditingCaption(false);
                  setCaptionVal(item.description ?? "");
                }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void saveCaption();
                }
              }}
              rows={4}
              className="w-full min-h-[5.5rem] sm:min-h-[6.5rem] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 resize-y"
              placeholder="Describe this photo or video (same size as email fields in your profile)…"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                disabled={savingCaption}
                onClick={() => void saveCaption()}
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingCaption ? "Saving…" : "Save caption"}
              </button>
              <button
                type="button"
                disabled={savingCaption}
                onClick={() => {
                  setEditingCaption(false);
                  setCaptionVal(item.description ?? "");
                }}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="w-full text-left rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-950/50 px-3 py-2.5 min-h-[3.25rem] text-sm text-slate-700 dark:text-slate-200 hover:border-slate-400 hover:bg-white dark:hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400 transition-colors"
          >
            {item.description ? (
              <span className="whitespace-pre-wrap break-words">{item.description}</span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                Tap to add or edit caption…
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function MediaGallery({
  items,
  projectId,
}: {
  items: MediaWithUrl[];
  projectId: string;
}) {
  const [media, setMedia] = useState(items);
  const [lightbox, setLightbox] = useState<MediaWithUrl | null>(null);
  const dragItemId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  async function handleDelete(item: MediaWithUrl) {
    if (!confirm("Delete this photo/video?")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/media/${item.id}`, { method: "DELETE" });
      if (res.ok) setMedia((prev) => prev.filter((m) => m.id !== item.id));
    } catch { /* silent */ }
  }

  function handleCaptionSaved(id: string, caption: string) {
    setMedia((prev) => prev.map((m) => m.id === id ? { ...m, description: caption || null } : m));
  }

  async function handleDragEnd() {
    const fromId = dragItemId.current;
    const toId = dragOverId.current;
    dragItemId.current = null;
    dragOverId.current = null;

    if (!fromId || !toId || fromId === toId) return;

    const fromIdx = media.findIndex((m) => m.id === fromId);
    const toIdx = media.findIndex((m) => m.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...media];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setMedia(reordered);

    // Persist new sort_order for all affected items
    await Promise.all(
      reordered.map((m, i) =>
        fetch(`/api/projects/${projectId}/media/${m.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: i }),
        })
      )
    );
  }

  if (media.length === 0) return null;

  return (
    <>
      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Photos & Videos ({media.length})
          </CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            Drag the grip on each thumbnail to reorder. Add or change text in the{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">Caption</span> area
            below each photo — same text size as email fields elsewhere in the app.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {media.map((item) => (
              <MediaThumb
                key={item.id}
                item={item}
                projectId={projectId}
                onOpenLightbox={() => setLightbox(item)}
                onDelete={() => void handleDelete(item)}
                onCaptionSaved={handleCaptionSaved}
                isDragging={dragItemId.current === item.id}
                isDragOver={dragOverId.current === item.id}
                onDragStart={() => { dragItemId.current = item.id; }}
                onDragEnter={() => { dragOverId.current = item.id; }}
                onDragEnd={() => void handleDragEnd()}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
