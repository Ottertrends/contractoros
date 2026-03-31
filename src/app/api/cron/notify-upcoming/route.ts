import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEvolutionClient } from "@/lib/evolution/client";
import { getSessionSlice } from "@/lib/whatsapp/session-store";
import { evolutionInstanceName } from "@/lib/whatsapp/instance-name";

export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  email: string | null;
  whatsapp_connected: boolean | null;
  whatsapp_instance_id: string | null;
  whatsapp_sessions: unknown;
  whatsapp_owner_jid: string | null;
  whatsapp_lid_pending: boolean | null;
  notifications_enabled: boolean | null;
}

interface RecurringRow {
  id: string;
  project_id: string;
  recurrence_type: string;
  next_occurrence: string;
  projects: { name: string | null } | null;
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

  // Fetch profiles with notifications enabled
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, email, whatsapp_connected, whatsapp_instance_id, whatsapp_sessions, whatsapp_owner_jid, whatsapp_lid_pending, notifications_enabled")
    .eq("notifications_enabled", true);

  if (profErr) {
    console.error("[cron/notify-upcoming] profiles fetch error:", profErr.message);
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const evolution = createEvolutionClient();
  let notified = 0;

  for (const profile of (profiles ?? []) as ProfileRow[]) {
    try {
      // Find recurring rules with next_occurrence tomorrow
      const { data: rules } = await admin
        .from("recurring_projects")
        .select("id, project_id, recurrence_type, next_occurrence, projects(name)")
        .eq("user_id", profile.id)
        .eq("active", true)
        .eq("next_occurrence", tomorrowStr) as { data: RecurringRow[] | null };

      if (!rules || rules.length === 0) continue;

      const projectLines = rules.map((r) => {
        const name = r.projects?.name ?? "Project";
        const type =
          r.recurrence_type === "weekly" ? "weekly"
          : r.recurrence_type === "monthly" ? "monthly"
          : "recurring";
        return `• ${name} (${type})`;
      });

      const message = `WorkSupp reminder 📋\n\nTomorrow's scheduled jobs (${tomorrowStr}):\n${projectLines.join("\n")}\n\nSent by WorkSupp`;

      // Try WhatsApp first
      let sent = false;
      if (profile.whatsapp_connected) {
        const instanceName =
          (profile.whatsapp_instance_id as string | null) ?? evolutionInstanceName(profile.id);
        const session = getSessionSlice(
          profile as Parameters<typeof getSessionSlice>[0],
          instanceName,
          evolutionInstanceName(profile.id),
        );
        const ownerJid = session.ownerJid;

        if (ownerJid) {
          try {
            await evolution.sendText(instanceName, ownerJid, message);
            sent = true;
            console.log(`[cron/notify-upcoming] WhatsApp sent to user ${profile.id}`);
          } catch (e) {
            console.warn(`[cron/notify-upcoming] WhatsApp failed for user ${profile.id}:`, e instanceof Error ? e.message : e);
          }
        }
      }

      // Email fallback via Resend
      if (!sent && profile.email) {
        const resendKey = process.env.RESEND_API_KEY?.trim();
        if (resendKey) {
          try {
            const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? "notifications@worksup.app";
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromEmail,
                to: profile.email,
                subject: `Tomorrow's jobs — ${tomorrowStr}`,
                text: message,
              }),
            });
            sent = true;
            console.log(`[cron/notify-upcoming] Email sent to user ${profile.id}`);
          } catch (e) {
            console.warn(`[cron/notify-upcoming] Email failed for user ${profile.id}:`, e instanceof Error ? e.message : e);
          }
        }
      }

      if (sent) notified++;
    } catch (e) {
      // Never let one user's failure break the whole cron
      console.error(`[cron/notify-upcoming] error for user ${profile.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[cron/notify-upcoming] notified ${notified} users for ${tomorrowStr}`);
  return NextResponse.json({ ok: true, notified, date: tomorrowStr });
}
