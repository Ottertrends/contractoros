"use client";

import * as React from "react";

import { supabase } from "@/lib/supabase/client";
import type { MessageLog, Project } from "@/lib/types/database";
import { MessageBubble } from "@/components/messages/message-bubble";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = MessageLog & {
  projects?: { id: string; name: string } | null;
};

export function MessageListClient({
  userId,
  initialMessages,
  projects,
}: {
  userId: string;
  initialMessages: Row[];
  projects: Pick<Project, "id" | "name">[];
}) {
  const [messages, setMessages] = React.useState<Row[]>(initialMessages);
  const [projectFilter, setProjectFilter] = React.useState<string>("all");
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(initialMessages.length >= 50);
  const offsetRef = React.useRef(initialMessages.length);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() => {
    if (projectFilter === "all") return messages;
    if (projectFilter === "none")
      return messages.filter((m) => !m.project_id);
    return messages.filter((m) => m.project_id === projectFilter);
  }, [messages, projectFilter]);

  React.useEffect(() => {
    setMessages(initialMessages);
    offsetRef.current = initialMessages.length;
    setHasMore(initialMessages.length >= 50);
  }, [initialMessages]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`messages-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `user_id=eq.${userId}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as unknown as MessageLog;
          let projects: { id: string; name: string } | null = null;
          if (row.project_id) {
            const { data } = await supabase
              .from("projects")
              .select("id, name")
              .eq("id", row.project_id)
            .single();
            projects = data;
          }
          setMessages((prev) => [...prev, { ...row, projects }]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      let q = supabase
        .from("messages")
        .select("*, projects:project_id(id, name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offsetRef.current, offsetRef.current + 49);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      if (rows.length < 50) setHasMore(false);
      offsetRef.current += rows.length;
      const chronological = [...rows].reverse();
      setMessages((prev) => [...chronological, ...prev]);
    } catch {
      /* toast optional */
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-12rem)] min-h-[400px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">Filter by project:</span>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All messages</SelectItem>
            <SelectItem value="none">No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        ref={rootRef}
        className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 flex flex-col gap-3"
      >
        {hasMore ? (
          <div className="flex justify-center pb-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load older messages"}
            </Button>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">
            No messages yet. Connect WhatsApp in Settings to start.
          </p>
        ) : (
          filtered.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
    </div>
  );
}
