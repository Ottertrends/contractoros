"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/client";

export function ProjectsToolbar({
  initialQuery,
  initialStatus: _initialStatus,
  sortBy,
  sortDir,
}: {
  initialQuery: string;
  initialStatus?: string;
  sortBy?: string;
  sortDir?: string;
}) {
  const router = useRouter();
  const { t } = useLanguage();

  const [q, setQ] = React.useState(initialQuery);

  React.useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  function pushWith({ nextQ = q }: { nextQ?: string } = {}) {
    const params = new URLSearchParams();
    if (nextQ.trim().length > 0) params.set("q", nextQ.trim());
    else params.delete("q");
    // preserve current status from URL if present
    const urlStatus =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("status")
        : null;
    if (urlStatus && urlStatus !== "all") params.set("status", urlStatus);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortDir) params.set("sortDir", sortDir);
    params.set("page", "1");
    router.push(`/dashboard/projects?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.projects.searchPlaceholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") pushWith();
          }}
          aria-label={t.projects.searchPlaceholder}
        />
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
