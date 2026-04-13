import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarClient } from "@/components/calendar/calendar-client";
import type { RecurringRule } from "@/app/api/recurring/route";

export default async function CalendarPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirected=true");

  const [{ data: rulesRaw }, { data: projects }, { data: profile }] = await Promise.all([
    supabase
      .from("recurring_projects")
      .select("*, projects(name)")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("next_occurrence", { ascending: true }),
    supabase
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("notifications_enabled")
      .eq("id", user.id)
      .single(),
  ]);

  const rules: RecurringRule[] = (rulesRaw ?? []).map((r) => ({
    id: r.id as string,
    project_id: r.project_id as string | null,
    project_name: (r.projects as { name?: string | null } | null)?.name ?? null,
    recurrence_type: r.recurrence_type as RecurringRule["recurrence_type"],
    day_of_week: r.day_of_week as number | null,
    interval_days: r.interval_days as number | null,
    day_of_month: r.day_of_month as number | null,
    manual_dates: (r.manual_dates as string[] | null) ?? null,
    start_date: r.start_date as string,
    next_occurrence: r.next_occurrence as string,
    active: r.active as boolean,
    event_time: (r.event_time as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));

  const notificationsEnabled = ((profile as unknown) as { notifications_enabled?: boolean | null } | null)
    ?.notifications_enabled ?? true;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Calendar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Set recurring schedules for your projects and view upcoming jobs on a monthly calendar.
        </p>
      </div>
      <CalendarClient
        initialRules={rules}
        projects={projects ?? []}
        initialNotificationsEnabled={!!notificationsEnabled}
      />
    </div>
  );
}
