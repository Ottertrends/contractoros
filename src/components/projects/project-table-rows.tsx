"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

function fmt(v: string | undefined | null) {
  const n = parseFloat(v ?? "0") || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function statusVariant(s: string): "success" | "neutral" | "warning" | "danger" {
  if (s === "active") return "success";
  if (s === "completed") return "neutral";
  if (s === "on_hold") return "warning";
  if (s === "cancelled") return "danger";
  return "neutral";
}

interface ProjectRow {
  id: string;
  name: string;
  client_name: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  status: string;
  updated_at: string | null;
  created_at: string | null;
}

export function ProjectTableRows({
  projects,
  invoiceTotalMap,
}: {
  projects: ProjectRow[];
  invoiceTotalMap: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <>
      {projects.map((p) => {
        const loc = [p.city, p.state].filter(Boolean).join(", ") || p.location || "—";
        return (
          <tr
            key={p.id}
            onClick={() => router.push(`/dashboard/projects/${p.id}`)}
            className="hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors"
          >
            <td className="py-3 pr-4 font-medium text-slate-800 dark:text-slate-200">{p.name}</td>
            <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">{p.client_name ?? "—"}</td>
            <td className="py-3 pr-4 text-slate-500">{loc}</td>
            <td className="py-3 pr-4">
              <Badge variant={statusVariant(p.status)}>{p.status.replace("_", " ")}</Badge>
            </td>
            <td className="py-3 pr-4 text-right font-mono text-slate-800 dark:text-slate-200">
              {fmt(invoiceTotalMap[p.id])}
            </td>
            <td className="py-3 pr-4 text-right text-slate-400 text-xs">{fmtDate(p.updated_at)}</td>
            <td className="py-3 text-right text-slate-400 text-xs">{fmtDate(p.created_at)}</td>
          </tr>
        );
      })}
    </>
  );
}
