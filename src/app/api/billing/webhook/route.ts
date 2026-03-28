import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Must use raw body — do NOT use createSupabaseServerClient here (no cookies)
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
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
      const session = event.data.object as { customer: string; subscription: string; metadata?: { supabase_user_id?: string } };
      const userId = session.metadata?.supabase_user_id ?? await getSupabaseUserId(session.customer);
      if (userId) {
        await updateProfile(userId, {
          subscription_status: "active",
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
      if (userId) await updateProfile(userId, { subscription_status: "active" });
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
  }

  return NextResponse.json({ received: true });
}
