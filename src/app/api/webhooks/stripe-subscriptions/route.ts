import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

/**
 * POST /api/webhooks/stripe-subscriptions
 *
 * Handles Stripe Connect webhook events for contractor → client subscriptions.
 * Register this endpoint in Stripe Dashboard → Connect → Webhooks with events:
 *   - checkout.session.completed
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.paid
 *
 * Use env var STRIPE_SUBSCRIPTIONS_WEBHOOK_SECRET for the signing secret.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_SUBSCRIPTIONS_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[stripe-subscriptions webhook] Missing STRIPE_SUBSCRIPTIONS_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("[stripe-subscriptions webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const connectedAccountId = event.account; // present for Connect events

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Only handle client subscription sessions
        if (session.metadata?.internal !== "client_subscription") break;

        const stripeSubId = session.subscription as string | null;
        const stripeCustomerId = session.customer as string | null;

        let status = "active";
        let currentPeriodEnd: string | null = null;
        let trialEnd: string | null = null;

        // Fetch subscription details if available
        if (stripeSubId && connectedAccountId) {
          try {
            const sub = await stripe.subscriptions.retrieve(
              stripeSubId,
              {},
              { stripeAccount: connectedAccountId },
            );
            status = sub.status === "trialing" ? "trialing" : "active";
            currentPeriodEnd = new Date((sub as unknown as Record<string, unknown>).current_period_end as number * 1000).toISOString();
            trialEnd = (sub as unknown as Record<string, unknown>).trial_end
              ? new Date(((sub as unknown as Record<string, unknown>).trial_end as number) * 1000).toISOString()
              : null;
          } catch (e) {
            console.error("[stripe-subscriptions webhook] Failed to retrieve subscription:", e);
          }
        }

        await supabase
          .from("client_subscriptions")
          .update({
            stripe_subscription_id: stripeSubId,
            stripe_customer_id: stripeCustomerId,
            status,
            current_period_end: currentPeriodEnd,
            trial_end: trialEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_checkout_session_id", session.id);

        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const subRecord = sub as unknown as Record<string, unknown>;

        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "trialing",
          past_due: "past_due",
          canceled: "canceled",
          incomplete: "incomplete",
          incomplete_expired: "canceled",
          unpaid: "past_due",
          paused: "past_due",
        };

        await supabase
          .from("client_subscriptions")
          .update({
            status: statusMap[sub.status] ?? "incomplete",
            current_period_end: new Date((subRecord.current_period_end as number) * 1000).toISOString(),
            trial_end: subRecord.trial_end
              ? new Date((subRecord.trial_end as number) * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        await supabase
          .from("client_subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);

        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const invRecord = inv as unknown as Record<string, unknown>;
        const stripeSubId = invRecord.subscription as string | null;

        // Only process subscription renewals (subscription field is set)
        if (!stripeSubId) break;

        // Find the WorkSupp client_subscription record
        const { data: subRow } = await supabase
          .from("client_subscriptions")
          .select("id, user_id, project_id, service_plan_id, updated_at")
          .eq("stripe_subscription_id", stripeSubId)
          .single();

        if (!subRow) {
          console.warn("[stripe-subscriptions webhook] No subscription found for", stripeSubId);
          break;
        }

        const sub = subRow as Record<string, unknown>;

        // Fetch service plan for name
        let planName = "Subscription";
        let planAmount: string | null = null;
        if (sub.service_plan_id) {
          const { data: plan } = await supabase
            .from("service_plans")
            .select("name, amount")
            .eq("id", sub.service_plan_id as string)
            .single();
          if (plan) {
            const p = plan as Record<string, unknown>;
            planName = p.name as string;
            planAmount = p.amount as string;
          }
        }

        const amountPaid = (invRecord.amount_paid as number ?? 0) / 100;
        const taxAmount = (invRecord.tax as number ?? 0) / 100;
        const subtotal = amountPaid - taxAmount;
        const today = new Date().toISOString().slice(0, 10);

        // Auto-generate invoice numbers using timestamp
        const invoiceNum = `SUB-${Date.now()}`;

        // Create WorkSupp invoice record (status: paid)
        const { data: newInvoice, error: invErr } = await supabase
          .from("invoices")
          .insert({
            project_id: sub.project_id as string,
            user_id: sub.user_id as string,
            invoice_number: invoiceNum,
            status: "paid",
            date: today,
            subtotal: String(subtotal > 0 ? subtotal : amountPaid),
            tax_rate: "0",
            tax_amount: String(taxAmount),
            total: String(amountPaid),
            notes: `Auto-generated from subscription: ${planName}`,
          })
          .select("id")
          .single();

        if (invErr) {
          console.error("[stripe-subscriptions webhook] Failed to create invoice:", invErr.message);
        } else if (newInvoice) {
          const newInv = newInvoice as Record<string, unknown>;
          // Add line item
          await supabase.from("invoice_items").insert({
            invoice_id: newInv.id as string,
            name: planName,
            description: planName,
            quantity: "1",
            unit_price: planAmount ?? String(amountPaid),
            total: planAmount ?? String(amountPaid),
            sort_order: 0,
          });
        }

        // Update current_period_end on the subscription
        const periodEnd = invRecord.period_end
          ? new Date((invRecord.period_end as number) * 1000).toISOString()
          : null;

        if (periodEnd) {
          await supabase
            .from("client_subscriptions")
            .update({ current_period_end: periodEnd, updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", stripeSubId);
        }

        break;
      }

      default:
        // Unhandled event — ignore
        break;
    }
  } catch (err) {
    console.error("[stripe-subscriptions webhook] Handler error:", err);
    return NextResponse.json({ error: "Internal handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
