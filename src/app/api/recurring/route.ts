import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RecurringRule {
  id: string;
  project_id: string;
  project_name: string | null;
  recurrence_type: "weekly" | "interval" | "monthly";
  day_of_week: number | null;
  interval_days: number | null;
  day_of_month: number | null;
  start_date: string;
  next_occurrence: string;
  active: boolean;
}

function computeFirstOccurrence(
  recurrence_type: string,
  day_of_week: number | null,
  interval_days: number | null,
  day_of_month: number | null,
  start_date: string,
): string {
  const start = new Date(start_date + "T00:00:00");

  if (recurrence_type === "weekly" && day_of_week != null) {
    // Find the first occurrence of day_of_week on or after start
    const d = new Date(start);
    while (d.getDay() !== day_of_week) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().slice(0, 10);
  }

  if (recurrence_type === "interval" && interval_days != null) {
    return start_date;
  }

  if (recurrence_type === "monthly" && day_of_month != null) {
    const d = new Date(start);
    d.setDate(day_of_month);
    // If this day already passed this month, move to next month
    if (d < start) d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }

  return start_date;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rules, error } = await supabase
    .from("recurring_projects")
    .select("*, projects(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("next_occurrence", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result: RecurringRule[] = (rules ?? []).map((r) => ({
    id: r.id as string,
    project_id: r.project_id as string,
    project_name: (r.projects as { name?: string | null } | null)?.name ?? null,
    recurrence_type: r.recurrence_type as RecurringRule["recurrence_type"],
    day_of_week: r.day_of_week as number | null,
    interval_days: r.interval_days as number | null,
    day_of_month: r.day_of_month as number | null,
    start_date: r.start_date as string,
    next_occurrence: r.next_occurrence as string,
    active: r.active as boolean,
  }));

  return NextResponse.json({ rules: result });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    projectId: string;
    recurrence_type: "weekly" | "interval" | "monthly";
    day_of_week?: number | null;
    interval_days?: number | null;
    day_of_month?: number | null;
    start_date?: string;
  };

  const { projectId, recurrence_type, day_of_week, interval_days, day_of_month } = body;
  if (!projectId || !recurrence_type) {
    return NextResponse.json({ error: "projectId and recurrence_type required" }, { status: 400 });
  }

  const start_date = body.start_date ?? new Date().toISOString().slice(0, 10);
  const next_occurrence = computeFirstOccurrence(
    recurrence_type,
    day_of_week ?? null,
    interval_days ?? null,
    day_of_month ?? null,
    start_date,
  );

  const { data, error } = await supabase
    .from("recurring_projects")
    .insert({
      user_id: user.id,
      project_id: projectId,
      recurrence_type,
      day_of_week: day_of_week ?? null,
      interval_days: interval_days ?? null,
      day_of_month: day_of_month ?? null,
      start_date,
      next_occurrence,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = (await request.json()) as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("recurring_projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
