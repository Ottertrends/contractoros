"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectMedia } from "@/lib/types/database";

export type MediaWithUrl = ProjectMedia & { signedUrl: string | null };

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
      title="Delete"
    >
      ×
    </button>
  );
}

function MediaThumb({
  item,
  onClick,
  onDelete,
}: {
  item: MediaWithUrl;
  onClick: () => void;
  onDelete: () => void;
}) {
  if (!item.signedUrl) return null;

  return (
    <div
      className="group relative cursor-pointer rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 aspect-square"
      onClick={onClick}
    >
      <DeleteButton onDelete={onDelete} />
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
      {item.description && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
          {item.description}
        </div>
      )}
    </div>
  );
}

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

export function MediaGallery({
  items,
  projectId,
}: {
  items: MediaWithUrl[];
  projectId: string;
}) {
  const [media, setMedia] = useState(items);
  const [lightbox, setLightbox] = useState<MediaWithUrl | null>(null);

  async function handleDelete(item: MediaWithUrl) {
    if (!confirm("Delete this photo/video?")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/media/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        setMedia((prev) => prev.filter((m) => m.id !== item.id));
      }
    } catch {
      // silent fail
    }
  }

  if (media.length === 0) return null;

  return (
    <>
      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos & Videos ({media.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {media.map((item) => (
              <MediaThumb
                key={item.id}
                item={item}
                onClick={() => setLightbox(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
