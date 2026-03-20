"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/client";

export function ProjectsToolbar({
  initialQuery,
  initialStatus,
}: {
  initialQuery: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const tp = t.projects;

  const [q, setQ] = React.useState(initialQuery);
  const [status, setStatus] = React.useState(initialStatus);

  React.useEffect(() => {
    setQ(initialQuery);
    setStatus(initialStatus);
  }, [initialQuery, initialStatus]);

  function pushWith({
    nextQ = q,
    nextStatus = status,
  }: {
    nextQ?: string;
    nextStatus?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (nextQ.trim().length > 0) params.set("q", nextQ.trim());
    else params.delete("q");
    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    else params.delete("status");
    params.set("page", "1");
    router.push(`/dashboard/projects?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tp.searchPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") pushWith();
          }}
          aria-label={tp.searchPlaceholder}
        />
      </div>

      <div className="w-full sm:w-56">
        <Select value={status} onValueChange={(v) => { setStatus(v); pushWith({ nextStatus: v }); }}>
          <SelectTrigger>
            <SelectValue placeholder={tp.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tp.allStatuses}</SelectItem>
            <SelectItem value="active">{tp.active}</SelectItem>
            <SelectItem value="on_hold">{tp.onHold}</SelectItem>
            <SelectItem value="completed">{tp.completed}</SelectItem>
            <SelectItem value="cancelled">{tp.cancelled}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => pushWith()}
        className="sm:self-end"
      >
        {t.common.search}
      </Button>
    </div>
  );
}
