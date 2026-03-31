import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function advanceDate(
  recurrence_type: string,
  day_of_week: number | null,
  interval_days: number | null,
  day_of_month: number | null,
  from: string,
): string {
  const d = new Date(from + "T00:00:00");

  if (recurrence_type === "weekly" && day_of_week != null) {
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  if (recurrence_type === "interval" && interval_days != null) {
    d.setDate(d.getDate() + interval_days);
    return d.toISOString().slice(0, 10);
  }

  if (recurrence_type === "monthly" && day_of_month != null) {
    d.setMonth(d.getMonth() + 1);
    d.setDate(day_of_month);
    return d.toISOString().slice(0, 10);
  }

  // fallback: 7 days
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch all active rules with next_occurrence <= today
  const { data: overdue, error } = await admin
    .from("recurring_projects")
    .select("id, recurrence_type, day_of_week, interval_days, day_of_month, next_occurrence")
    .eq("active", true)
    .lte("next_occurrence", today);

  if (error) {
    console.error("[cron/update-recurring] fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  for (const rule of overdue ?? []) {
    let next = rule.next_occurrence as string;
    // Keep advancing until next > today (catches long-overdue rules)
    let iterations = 0;
    while (next <= today && iterations < 365) {
      next = advanceDate(
        rule.recurrence_type as string,
        rule.day_of_week as number | null,
        rule.interval_days as number | null,
        rule.day_of_month as number | null,
        next,
      );
      iterations++;
    }
    await admin
      .from("recurring_projects")
      .update({ next_occurrence: next })
      .eq("id", rule.id as string);
    updated++;
  }

  console.log(`[cron/update-recurring] advanced ${updated} rules`);
  return NextResponse.json({ ok: true, updated });
}
