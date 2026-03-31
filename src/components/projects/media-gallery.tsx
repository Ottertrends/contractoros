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
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`group relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 aspect-square transition-opacity ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
    >
      {/* Drag handle */}
      <div
        className="absolute top-1 left-1 z-10 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded px-1 py-0.5"
        title="Drag to reorder"
      >
        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6h8M8 12h8M8 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        title="Delete"
      >
        ×
      </button>

      {/* Thumbnail */}
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

      {/* Caption bar */}
      {editingCaption ? (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/80 px-2 py-1 flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            autoFocus
            value={captionVal}
            onChange={(e) => setCaptionVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveCaption();
              if (e.key === "Escape") setEditingCaption(false);
            }}
            className="flex-1 bg-transparent text-white text-xs outline-none placeholder-slate-400 min-w-0"
            placeholder="Add caption…"
          />
          <button
            disabled={savingCaption}
            onClick={() => void saveCaption()}
            className="text-xs text-blue-300 hover:text-blue-100 shrink-0"
          >
            {savingCaption ? "…" : "Save"}
          </button>
        </div>
      ) : (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 cursor-text opacity-0 group-hover:opacity-100 transition-opacity truncate"
          onClick={(e) => { e.stopPropagation(); setEditingCaption(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          title="Click to edit caption"
        >
          {item.description ? item.description : <span className="text-slate-400 italic">Add caption…</span>}
        </div>
      )}
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
            <span className="ml-2 text-xs font-normal text-slate-400">Drag to reorder · Click caption to edit</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
