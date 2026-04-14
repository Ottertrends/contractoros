import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Must use raw body — do NOT use createSupabaseServerClient here (no cookies)
  const admin = createSupabaseAdminClient();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  async function getSupabaseUserId(customerId: string): Promise<string | null> {
    const customer = await getStripe().customers.retrieve(customerId);
    if (customer.deleted) return null;
    return (customer as { metadata?: { supabase_user_id?: string } }).metadata?.supabase_user_id ?? null;
  }

  async function updateProfile(userId: string, updates: Record<string, unknown>) {
    await admin.from("profiles").update(updates).eq("id", userId);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        customer: string;
        subscription?: string | null;
        metadata?: {
          supabase_user_id?: string;
          internal_invoice_id?: string;
          plan?: string;
          interval?: string;
          extra_seats?: string;
        };
        payment_status?: string;
      };

      const contractorInvoiceId = session.metadata?.internal_invoice_id?.trim();
      if (contractorInvoiceId && session.payment_status === "paid" && !session.subscription) {
        await admin
          .from("invoices")
          .update({
            status: "paid",
            stripe_checkout_session_id: (session as { id?: string }).id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contractorInvoiceId);
        break;
      }

      const userId = session.metadata?.supabase_user_id ?? await getSupabaseUserId(session.customer);
      if (userId) {
        const { data: prof } = await admin.from("profiles").select("subscription_plan").eq("id", userId).single();
        // Honor admin-granted plans and legacy paid plans — don't overwrite them
        const PROTECTED_PLANS = ["free_premium", "free_premium_team", "standard", "paid"];
        const adminGranted = PROTECTED_PLANS.includes(prof?.subscription_plan ?? "");
        const newPlan = adminGranted
          ? prof?.subscription_plan
          : (session.metadata?.plan ?? "premium");
        const extraSeats = parseInt(session.metadata?.extra_seats ?? "0", 10);
        await updateProfile(userId, {
          subscription_status: "active",
          subscription_plan: newPlan,
          subscription_seats: extraSeats,
          subscription_billing_interval: session.metadata?.interval ?? "monthly",
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          subscription_started_at: new Date().toISOString(),
          subscription_ended_at: null,
        });
      }
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as { customer: string };
      const userId = await getSupabaseUserId(invoice.customer);
      if (userId) {
        const { data: prof } = await admin.from("profiles").select("subscription_plan").eq("id", userId).single();
        // Keep admin-granted plans intact
        const adminGranted = prof?.subscription_plan === "free_premium" || prof?.subscription_plan === "free_premium_team";
        if (!adminGranted) {
          await updateProfile(userId, { subscription_status: "active" });
        }
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as { customer: string };
      const userId = await getSupabaseUserId(invoice.customer);
      if (userId) await updateProfile(userId, { subscription_status: "past_due" });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as { customer: string };
      const userId = await getSupabaseUserId(sub.customer);
      if (userId) {
        await updateProfile(userId, {
          subscription_status: "canceled",
          subscription_ended_at: new Date().toISOString(),
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as { customer: string; status: string };
      const userId = await getSupabaseUserId(sub.customer);
      if (userId) await updateProfile(userId, { subscription_status: sub.status });
      break;
    }
    case "account.updated": {
      const account = event.data.object as {
        id: string;
        charges_enabled?: boolean;
        details_submitted?: boolean;
        metadata?: { supabase_user_id?: string };
      };
      const uid = account.metadata?.supabase_user_id;
      if (uid) {
        await updateProfile(uid, {
          stripe_connect_charges_enabled: !!account.charges_enabled,
          stripe_connect_details_submitted: !!account.details_submitted,
        });
      } else if (account.id) {
        await admin
          .from("profiles")
          .update({
            stripe_connect_charges_enabled: !!account.charges_enabled,
            stripe_connect_details_submitted: !!account.details_submitted,
          })
          .eq("stripe_connect_account_id", account.id);
      }
      // Ensure ACH capability is requested whenever charges become enabled
      if (account.charges_enabled && account.id) {
        try {
          await getStripe().accounts.update(account.id, {
            capabilities: { us_bank_account_ach_payments: { requested: true } },
          });
        } catch { /* non-fatal */ }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
