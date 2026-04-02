import { google } from "googleapis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptGoogleRefreshToken } from "@/lib/crypto/token-encrypt";
import { getOAuth2Client } from "@/lib/integrations/google-oauth";

interface RuleRow {
  id: string;
  user_id: string;
  project_id: string;
  recurrence_type: string;
  next_occurrence: string;
  event_time: string | null;
  notes: string | null;
  google_calendar_id: string | null;
  google_event_id: string | null;
  projects?: { name?: string | null } | null;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildRrule(type: string, day_of_week: number | null, interval_days: number | null, day_of_month: number | null): string[] | undefined {
  if (type === "weekly" && day_of_week != null) {
    const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    return [`RRULE:FREQ=WEEKLY;BYDAY=${days[day_of_week]}`];
  }
  if (type === "interval" && interval_days != null && interval_days > 0) {
    return [`RRULE:FREQ=DAILY;INTERVAL=${interval_days}`];
  }
  if (type === "monthly" && day_of_month != null) {
    return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${day_of_month}`];
  }
  return undefined;
}

async function getCalendarClientForUser(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from("user_google_integrations")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !row) return null;
  if (!row.refresh_token_ciphertext) return null;

  const refreshToken = decryptGoogleRefreshToken(
    row.refresh_token_ciphertext as string,
    row.refresh_token_iv as string,
    row.refresh_token_tag as string,
  );
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  return { calendar, calendarSyncEnabled: row.calendar_sync_enabled !== false };
}

export async function syncRecurringRuleToGoogle(ruleId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: rule, error: fetchErr } = await admin
    .from("recurring_projects")
    .select("*, projects(name)")
    .eq("id", ruleId)
    .single();
  if (fetchErr || !rule) return { ok: false, error: "Rule not found" };

  const r = rule as unknown as RuleRow;
  const client = await getCalendarClientForUser(r.user_id);
  if (!client) return { ok: false, error: "Google not connected" };
  if (!client.calendarSyncEnabled) return { ok: true };

  const { calendar } = client;
  const calendarId = r.google_calendar_id || "primary";
  const projectName = (r.projects as { name?: string | null } | null)?.name ?? "Job";
  const summary = `WorkSupp: ${projectName}`;
  const description = [r.notes].filter(Boolean).join("\n") || `Recurring ${r.recurrence_type} schedule`;

  const dayOfWeek = rule.day_of_week as number | null;
  const intervalDays = rule.interval_days as number | null;
  const dayOfMonth = rule.day_of_month as number | null;

  const recurrence =
    r.recurrence_type === "manual"
      ? undefined
      : buildRrule(r.recurrence_type, dayOfWeek, intervalDays, dayOfMonth);

  // All-day events avoid fragile timezone handling; time is noted in description.
  const timeNote = r.event_time ? ` @ ${r.event_time}` : "";
  const fullDescription = `${description}${timeNote}`;
  const start = { date: r.next_occurrence };
  const end = { date: addDays(r.next_occurrence, 1) };

  try {
    if (r.google_event_id) {
      await calendar.events.patch({
        calendarId,
        eventId: r.google_event_id,
        requestBody: {
          summary,
          description: fullDescription,
          start,
          end,
          recurrence,
        },
      });
    } else {
      const insert = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description: fullDescription,
          start,
          end,
          recurrence,
        },
      });
      const eventId = insert.data.id;
      if (eventId) {
        await admin
          .from("recurring_projects")
          .update({
            google_event_id: eventId,
            google_calendar_id: calendarId,
          })
          .eq("id", ruleId);
      }
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Calendar sync failed";
    console.error("[google-calendar-sync]", msg);
    return { ok: false, error: msg };
  }
}

export async function deleteGoogleEventForRule(ruleId: string, userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: rule } = await admin
    .from("recurring_projects")
    .select("google_event_id, google_calendar_id")
    .eq("id", ruleId)
    .eq("user_id", userId)
    .single();
  if (!rule?.google_event_id) return;

  const client = await getCalendarClientForUser(userId);
  if (!client) return;
  const calendarId = (rule.google_calendar_id as string) || "primary";
  try {
    await client.calendar.events.delete({
      calendarId,
      eventId: rule.google_event_id as string,
    });
  } catch {
    /* ignore */
  }
}
