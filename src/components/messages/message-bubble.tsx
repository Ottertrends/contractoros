import { cn } from "@/lib/utils";
import type { MessageLog } from "@/lib/types/database";
import Link from "next/link";

export function MessageBubble({
  message,
}: {
  message: MessageLog & { projects?: { name: string } | null };
}) {
  const inbound = message.direction === "inbound";
  return (
    <div
      className={cn(
        "flex w-full",
        inbound ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm",
          inbound
            ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
            : "bg-primary text-white dark:bg-slate-700 dark:text-slate-50",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            "mt-2 text-[10px] opacity-80 flex flex-col gap-0.5",
            inbound ? "text-slate-600" : "text-white/90",
          )}
        >
          <span>
            {new Date(message.created_at).toLocaleString()}
          </span>
          {message.project_id && message.projects?.name ? (
            <Link
              href={`/dashboard/projects/${message.project_id}`}
              className="underline hover:no-underline"
            >
              Project: {message.projects.name}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
