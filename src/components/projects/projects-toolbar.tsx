"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function ProjectsToolbar({
  initialQuery,
  initialStatus,
}: {
  initialQuery: string;
  initialStatus: string;
}) {
  const router = useRouter();

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
          placeholder="Search projects (name, client, location, notes)"
          onKeyDown={(e) => {
            if (e.key === "Enter") pushWith();
          }}
          aria-label="Search projects"
        />
      </div>

      <div className="w-full sm:w-56">
        <Select value={status} onValueChange={(v) => { setStatus(v); pushWith({ nextStatus: v }); }}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => pushWith()}
        className="sm:self-end"
      >
        Search
      </Button>
    </div>
  );
}

