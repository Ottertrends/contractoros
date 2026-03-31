"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import type { RecurringRule } from "@/app/api/recurring/route";

interface Project {
  id: string;
  name: string | null;
}

interface Props {
  initialRules: RecurringRule[];
  projects: Project[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Recurrence math ──────────────────────────────────────────────────────────

function occurrencesInRange(rule: RecurringRule, start: Date, end: Date): Date[] {
  const results: Date[] = [];

  if (rule.recurrence_type === "weekly" && rule.day_of_week != null) {
    const d = new Date(start);
    // Align to the target day of week
    while (d.getDay() !== rule.day_of_week) d.setDate(d.getDate() + 1);
    while (d <= end) {
      results.push(new Date(d));
      d.setDate(d.getDate() + 7);
    }
  } else if (rule.recurrence_type === "interval" && rule.interval_days != null) {
    // Expand from next_occurrence backwards and forwards within range
    const anchor = new Date(rule.next_occurrence + "T00:00:00");
    const interval = rule.interval_days;
    // Walk back to range start
    let d = new Date(anchor);
    while (d > start) d.setDate(d.getDate() - interval);
    d.setDate(d.getDate() + interval); // one step forward (first ≥ start candidate)
    while (d <= end) {
      if (d >= start) results.push(new Date(d));
      d.setDate(d.getDate() + interval);
    }
  } else if (rule.recurrence_type === "monthly" && rule.day_of_month != null) {
    const d = new Date(start.getFullYear(), start.getMonth(), rule.day_of_month);
    if (d < start) d.setMonth(d.getMonth() + 1);
    while (d <= end) {
      if (d >= start) results.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
  }

  return results;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarClient({ initialRules, projects }: Props) {
  const today = new Date();
  const [year, setYear] = React.useState(today.getFullYear());
  const [month, setMonth] = React.useState(today.getMonth());
  const [rules, setRules] = React.useState<RecurringRule[]>(initialRules);

  // Form state
  const [formProjectId, setFormProjectId] = React.useState("");
  const [formType, setFormType] = React.useState<"weekly" | "interval" | "monthly">("weekly");
  const [formDayOfWeek, setFormDayOfWeek] = React.useState<number>(1); // Monday
  const [formIntervalDays, setFormIntervalDays] = React.useState<number>(7);
  const [formDayOfMonth, setFormDayOfMonth] = React.useState<number>(1);
  const [formSaving, setFormSaving] = React.useState(false);

  // Build occurrence map for current month
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const occurrenceMap: Record<string, RecurringRule[]> = {};
  for (const rule of rules) {
    const dates = occurrencesInRange(rule, monthStart, monthEnd);
    for (const d of dates) {
      const key = toDateKey(d);
      if (!occurrenceMap[key]) occurrenceMap[key] = [];
      occurrenceMap[key].push(rule);
    }
  }

  // Build calendar grid
  const firstDayOfWeek = monthStart.getDay(); // 0-6
  const daysInMonth = monthEnd.getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  async function handleAddRule() {
    if (!formProjectId) { toast.error("Select a project"); return; }
    setFormSaving(true);
    try {
      const body: Record<string, unknown> = {
        projectId: formProjectId,
        recurrence_type: formType,
      };
      if (formType === "weekly") body.day_of_week = formDayOfWeek;
      if (formType === "interval") body.interval_days = formIntervalDays;
      if (formType === "monthly") body.day_of_month = formDayOfMonth;

      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { rule?: RecurringRule; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      // Refresh rules from server
      const listRes = await fetch("/api/recurring");
      const listData = (await listRes.json()) as { rules?: RecurringRule[] };
      setRules(listData.rules ?? []);
      toast.success("Recurring schedule saved");
      setFormProjectId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/recurring", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success("Rule removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  function describeRule(r: RecurringRule): string {
    if (r.recurrence_type === "weekly") return `Every ${DAY_LABELS[r.day_of_week ?? 0]}`;
    if (r.recurrence_type === "interval") return `Every ${r.interval_days} days`;
    if (r.recurrence_type === "monthly") return `Monthly on day ${r.day_of_month}`;
    return "";
  }

  const todayKey = toDateKey(today);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar grid */}
      <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7 gap-px bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden">
          {cells.map((day, i) => {
            if (!day) {
              return <div key={`empty-${i}`} className="bg-slate-50 dark:bg-slate-900 min-h-[64px]" />;
            }
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayRules = occurrenceMap[key] ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className="bg-white dark:bg-slate-950 min-h-[64px] p-1.5"
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1 ${
                    isToday
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {day}
                </span>
                <div className="space-y-0.5">
                  {dayRules.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      title={r.project_name ?? "Project"}
                    >
                      {r.project_name ?? "Project"}
                    </div>
                  ))}
                  {dayRules.length > 3 && (
                    <div className="text-[10px] text-slate-400">+{dayRules.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="space-y-5">
        {/* Add rule form */}
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add Recurring Schedule</h3>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Project</label>
            <select
              value={formProjectId}
              onChange={e => setFormProjectId(e.target.value)}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">— Select project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name ?? "Untitled"}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Repeat</label>
            <select
              value={formType}
              onChange={e => setFormType(e.target.value as "weekly" | "interval" | "monthly")}
              className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="weekly">Every week (pick a day)</option>
              <option value="interval">Every N days</option>
              <option value="monthly">Monthly (pick day of month)</option>
            </select>
          </div>

          {formType === "weekly" && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Day of week</label>
              <select
                value={formDayOfWeek}
                onChange={e => setFormDayOfWeek(Number(e.target.value))}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none"
              >
                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {formType === "interval" && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Every how many days?</label>
              <input
                type="number"
                min={1}
                max={365}
                value={formIntervalDays}
                onChange={e => setFormIntervalDays(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}

          {formType === "monthly" && (
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Day of month (1–28)</label>
              <input
                type="number"
                min={1}
                max={28}
                value={formDayOfMonth}
                onChange={e => setFormDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleAddRule()}
            disabled={formSaving || !formProjectId}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {formSaving ? "Saving..." : "Add Schedule"}
          </button>
        </div>

        {/* Active rules list */}
        {rules.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Active Schedules</h3>
            {rules.map(r => (
              <div key={r.id} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{r.project_name ?? "Project"}</p>
                  <p className="text-xs text-slate-400">{describeRule(r)} · Next: {r.next_occurrence}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(r.id)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
