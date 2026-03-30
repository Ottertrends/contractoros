"use client";

import * as React from "react";

type SupportMessage = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  message: string;
  status: string;
  created_at: string;
};

export function AdminMessagesClient({ messages }: { messages: SupportMessage[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [statuses, setStatuses] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(messages.map((m) => [m.id, m.status]))
  );

  async function markRead(id: string) {
    setStatuses((prev) => ({ ...prev, [id]: "read" }));
    await fetch(`/api/admin/support/${id}/read`, { method: "PATCH" });
  }

  const unread = messages.filter((m) => (statuses[m.id] ?? m.status) === "unread").length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Support Messages</h1>
          {unread > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold">
              {unread} unread
            </span>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500">
            No messages yet.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => {
              const status = statuses[msg.id] ?? msg.status;
              const isExpanded = expanded === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`bg-white dark:bg-slate-900 rounded-xl border p-4 transition-colors ${
                    status === "unread"
                      ? "border-blue-300 dark:border-blue-700"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm">
                          {msg.user_name ?? "Unknown user"}
                        </span>
                        {msg.user_email && (
                          <span className="text-xs text-slate-500">{msg.user_email}</span>
                        )}
                        {status === "unread" && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {new Date(msg.created_at).toLocaleString("en-US", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {status === "unread" && (
                        <button
                          type="button"
                          onClick={() => void markRead(msg.id)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : msg.id)}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        {isExpanded ? "Collapse" : "View"}
                      </button>
                    </div>
                  </div>

                  {!isExpanded ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {msg.message}
                    </p>
                  ) : (
                    <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                        {msg.message}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
