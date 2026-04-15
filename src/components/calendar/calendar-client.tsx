"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bell, BellOff, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import type { RecurringRule } from "@/app/api/recurring/route";
import { useLanguage } from "@/lib/i18n/client";

interface Project {
  id: string;
  name: string | null;
}

interface Props {
  initialRules: RecurringRule[];
  projects: Project[];
  initialNotificationsEnabled: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Recurrence math ──────────────────────────────────────────────────────────

/** If a date falls on Sunday (0), push to Monday. */
function skipSunday(d: Date): Date {
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

function occurrencesInRange(rule: RecurringRule, start: Date, end: Date): Date[] {
  const results: Date[] = [];

  if (rule.recurrence_type === "weekly" && rule.day_of_week != null) {
    const d = new Date(start);
    while (d.getDay() !== rule.day_of_week) d.setDate(d.getDate() + 1);
    while (d <= end) {
      results.push(new Date(d));
      d.setDate(d.getDate() + 7);
    }
  } else if (rule.recurrence_type === "interval" && rule.interval_days != null) {
    const anchor = new Date(rule.next_occurrence + "T00:00:00");
    const interval = rule.interval_days;
    let d = new Date(anchor);
    while (d > start) d.setDate(d.getDate() - interval);
    d.setDate(d.getDate() + interval);
    while (d <= end) {
      if (d >= start) {
        // Skip Sundays → Monday
        const adjusted = skipSunday(new Date(d));
        if (adjusted <= end) results.push(adjusted);
      }
      d.setDate(d.getDate() + interval);
    }
  } else if (rule.recurrence_type === "monthly" && rule.day_of_month != null) {
    const d = new Date(start.getFullYear(), start.getMonth(), rule.day_of_month);
    if (d < start) d.setMonth(d.getMonth() + 1);
    while (d <= end) {
      if (d >= start) results.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
  } else if (rule.recurrence_type === "manual" && rule.manual_dates?.length) {
    const startKey = start.toISOString().slice(0, 10);
    const endKey = end.toISOString().slice(0, 10);
    for (const dateStr of rule.manual_dates) {
      if (dateStr >= startKey && dateStr <= endKey) {
        results.push(new Date(dateStr + "T00:00:00"));
      }
    }
  }

  return results;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarClient({ initialRules, projects, initialNotificationsEnabled }: Props) {
  const { t } = useLanguage();
  const today = new Date();
  const [year, setYear] = React.useState(today.getFullYear());
  const [month, setMonth] = React.useState(today.getMonth());
  const [rules, setRules] = React.useState<RecurringRule[]>(initialRules);

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(initialNotificationsEnabled);
  const [notifSaving, setNotifSaving] = React.useState(false);

  // Form state
  const [formProjectId, setFormProjectId] = React.useState("");
  const [formType, setFormType] = React.useState<"weekly" | "interval" | "monthly" | "manual">("weekly");
  const [formDayOfWeek, setFormDayOfWeek] = React.useState<number>(1); // Monday
  const [formIntervalDays, setFormIntervalDays] = React.useState<number>(7);
  const [formDayOfMonth, setFormDayOfMonth] = React.useState<number>(1);
  const [formTime, setFormTime] = React.useState<string>("");
  const [formNotes, setFormNotes] = React.useState<string>("");
  const [formSaving, setFormSaving] = React.useState(false);

  // Manual date selection state
  const [selectedDates, setSelectedDates] = React.useState<Set<string>>(new Set());
  const [manualFlash, setManualFlash] = React.useState<string | null>(null);

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
  const firstDayOfWeek = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function handleDateClick(day: number) {
    if (formType !== "manual") return;
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setManualFlash(key);
    setTimeout(() => setManualFlash(null), 400);
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleNotificationsToggle() {
    const next = !notificationsEnabled;
    setNotifSaving(true);
    try {
      const res = await fetch("/api/notifications/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setNotificationsEnabled(next);
      toast.success(next ? t.toasts.notificationsEnabled : t.toasts.notificationsDisabled);
    } catch {
      toast.error("Failed to update notification setting");
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleAddRule() {
    if (formType === "manual" && selectedDates.size === 0) {
      toast.error("Select at least one date on the calendar");
      return;
    }
    setFormSaving(true);
    try {
      const body: Record<string, unknown> = {
        projectId: formProjectId,
        recurrence_type: formType,
      };
      if (formType === "weekly") body.day_of_week = formDayOfWeek;
      if (formType === "interval") body.interval_days = formIntervalDays;
      if (formType === "monthly") body.day_of_month = formDayOfMonth;
      if (formType === "manual") body.manual_dates = Array.from(selectedDates).sort();
      if (formTime) body.event_time = formTime;
      if (formNotes.trim()) body.notes = formNotes.trim();

      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { rule?: RecurringRule; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      const listRes = await fetch("/api/recurring");
      const listData = (await listRes.json()) as { rules?: RecurringRule[] };
      setRules(listData.rules ?? []);
      toast.success(t.toasts.scheduleSaved);
      setFormProjectId("");
      setSelectedDates(new Set());
      setFormTime("");
      setFormNotes("");
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
      toast.success(t.toasts.scheduleRemoved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  function describeRule(r: RecurringRule): string {
    if (r.recurrence_type === "weekly") return `Every ${DAY_LABELS[r.day_of_week ?? 0]}`;
    if (r.recurrence_type === "interval") return `Every ${r.interval_days} days`;
    if (r.recurrence_type === "monthly") return `Monthly on day ${r.day_of_month}`;
    if (r.recurrence_type === "manual") return `Manual (${r.manual_dates?.length ?? 0} dates)`;
    return "";
  }

  const todayKey = toDateKey(today);
  const isManualMode = formType === "manual";

  return (
    <div className="space-y-4">
      {/* Notifications toggle bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 px-5 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Job Reminders</p>
          <p className="text-xs text-slate-400 mt-0.5">WhatsApp notification the day before a scheduled job</p>
        </div>
        <button
          type="button"
          onClick={() => void handleNotificationsToggle()}
          disabled={notifSaving}
          aria-pressed={notificationsEnabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
            notificationsEnabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
          }`}
          title={notificationsEnabled ? "Notifications on" : "Notifications off"}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 shadow transition-transform duration-200 ${
              notificationsEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        {notificationsEnabled
          ? <Bell className="ml-3 h-4 w-4 text-slate-500 flex-shrink-0" />
          : <BellOff className="ml-3 h-4 w-4 text-slate-400 flex-shrink-0" />
        }
      </div>

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
            <div className="text-center">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {MONTH_NAMES[month]} {year}
              </h2>
              {isManualMode && (
                <p className="text-xs text-blue-500 mt-0.5 animate-pulse">Click dates to select them</p>
              )}
            </div>
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
              const isSelected = selectedDates.has(key);
              const isFlashing = manualFlash === key;

              return (
                <div
                  key={key}
                  onClick={() => handleDateClick(day)}
                  className={`min-h-[64px] p-1.5 transition-colors ${
                    isManualMode ? "cursor-pointer" : ""
                  } ${
                    isFlashing
                      ? "bg-blue-200 dark:bg-blue-800"
                      : isSelected
                      ? "bg-blue-50 dark:bg-blue-950/60 ring-1 ring-inset ring-blue-300 dark:ring-blue-700"
                      : "bg-white dark:bg-slate-950"
                  } ${isManualMode && !isSelected && !isFlashing ? "hover:bg-slate-50 dark:hover:bg-slate-900" : ""}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1 ${
                      isToday
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : isSelected
                        ? "bg-blue-500 text-white"
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
                        title={[r.project_name ?? "Internal task", r.event_time, r.notes].filter(Boolean).join(" · ")}
                      >
                        {r.project_name ?? "Internal task"}
                        {r.event_time ? ` ${r.event_time}` : ""}
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
                <option value="">— No project (internal task) —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? "Untitled"}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Repeat</label>
              <select
                value={formType}
                onChange={e => {
                  setFormType(e.target.value as typeof formType);
                  setSelectedDates(new Set());
                }}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <option value="manual">Manual (pick dates)</option>
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
                <p className="text-xs text-slate-400 mt-1">Jobs landing on Sunday automatically move to Monday.</p>
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

            {formType === "manual" && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 px-3 py-2">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  Click dates on the calendar to select them.
                </p>
                {selectedDates.size > 0 && (
                  <p className="text-xs text-blue-500 mt-1">
                    {selectedDates.size} date{selectedDates.size > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            )}

            {/* Optional time */}
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Time <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="time"
                value={formTime}
                onChange={e => setFormTime(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>

            {/* Optional notes */}
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="e.g. Bring extra tools, confirm with client beforehand…"
                rows={2}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleAddRule()}
              disabled={formSaving || (formType === "manual" && selectedDates.size === 0)}
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
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{r.project_name ?? "Internal task"}</p>
                    <p className="text-xs text-slate-400">
                      {describeRule(r)} · Next: {r.next_occurrence}
                      {r.event_time ? ` · ${r.event_time}` : ""}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate" title={r.notes}>{r.notes}</p>
                    )}
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
    </div>
  );
}
