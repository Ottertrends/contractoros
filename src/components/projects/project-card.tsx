"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { useLanguage } from "@/lib/i18n/client";
import type { InvoiceStatus, Project } from "@/lib/types/database";

function formatCurrency(value: string | null) {
  if (!value) return "$0.00";
  const num = Number(value);
  if (Number.isNaN(num)) return "$0.00";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function statusBadgeVariant(status: Project["status"]) {
  switch (status) {
    case "active":
      return "success";
    case "on_hold":
      return "warning";
    case "completed":
      return "neutral";
    case "cancelled":
      return "danger";
    default:
      return "secondary";
  }
}

const invoiceBadgeColors: Record<InvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
};

export function ProjectCard({ project, invoiceStatus }: { project: Project; invoiceStatus?: InvoiceStatus }) {
  const { t } = useLanguage();
  const tp = t.projects;

  const lastUpdated = project.updated_at
    ? new Date(project.updated_at).toLocaleDateString()
    : "";

  const locationText = project.city
    ? `${project.city}${project.state ? ", " + project.state : ""}`
    : project.location ?? "";

  // Translate status label
  const statusLabel: Record<Project["status"], string> = {
    active: tp.active,
    on_hold: tp.onHold,
    completed: tp.completed,
    cancelled: tp.cancelled,
  };

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="block"
      aria-label={`Open project ${project.name}`}
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 dark:text-slate-50 truncate">
                {project.name}
              </div>
              {project.client_name ? (
                <div className="text-sm text-slate-600 dark:text-slate-300 truncate">
                  {project.client_name}
                </div>
              ) : null}
              {locationText ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                  {locationText}
                </div>
              ) : null}
            </div>
            <Badge variant={statusBadgeVariant(project.status)}>
              {statusLabel[project.status] ?? project.status.replace("_", " ")}
            </Badge>
          </div>

          <div className="text-sm text-slate-700 dark:text-slate-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
              {tp.currentWork}
            </div>
            <div className="overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
              {project.current_work ?? "—"}
            </div>
          </div>

          <div className="mt-auto flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">{tp.quotedAmount}</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {formatCurrency(project.quoted_amount)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {invoiceStatus && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${invoiceBadgeColors[invoiceStatus]}`}>
                  {invoiceStatus}
                </span>
              )}
              <div className="text-right">
                <div className="text-xs text-slate-500">{tp.lastUpdated}</div>
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  {lastUpdated}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
