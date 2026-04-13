import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isPremium, isPremiumTeam, normalizePlan } from "@/lib/billing/access";
import { BillingActions } from "./BillingActions";

const PLAN_DISPLAY: Record<string, { label: string; color: string }> = {
  basic: { label: "Basic (Free)", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  premium: { label: "Premium", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  premium_team: { label: "Premium Team", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  free_premium: { label: "Premium (Complimentary)", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  free_premium_team: { label: "Premium Team (Complimentary)", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  discounted_premium: { label: "Premium — 50% Discount", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  discounted_premium_team: { label: "Premium Team — 50% Discount", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_plan, subscription_seats, subscription_billing_interval, subscription_started_at, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const normalizedPlan = normalizePlan(profile?.subscription_plan);
  const paid = isPremium(profile ?? {});
  const isTeam = isPremiumTeam(profile ?? {});
  const isAdminGranted = normalizedPlan === "free_premium" || normalizedPlan === "free_premium_team";
  const status = profile?.subscription_status ?? "none";
  const planDisplay = PLAN_DISPLAY[normalizedPlan] ?? PLAN_DISPLAY.basic;
  const extraSeats = profile?.subscription_seats ?? 0;

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscription</h1>

      {/* Status card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500 mb-1">Current Plan</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">{planDisplay.label}</div>
            {isTeam && !isAdminGranted && (
              <div className="text-xs text-slate-400 mt-0.5">
                {2 + extraSeats} seats included
                {profile?.subscription_billing_interval === "annual" ? " · Annual billing" : " · Monthly billing"}
              </div>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${planDisplay.color}`}>
            {isAdminGranted
              ? "Complimentary"
              : paid
              ? status === "trialing" ? "Trialing" : "Active"
              : status === "past_due"
              ? "Past Due"
              : status === "canceled"
              ? "Canceled"
              : "Free"}
          </span>
        </div>

        {profile?.subscription_started_at && paid && (
          <p className="text-sm text-slate-500">
            Subscriber since{" "}
            {new Date(profile.subscription_started_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}

        {!isAdminGranted && (
          <BillingActions
            paid={paid}
            hasStripeCustomer={!!profile?.stripe_customer_id}
            plan={profile?.subscription_plan ?? "basic"}
            normalizedPlan={normalizedPlan}
          />
        )}
      </div>

      {/* Free tier limits info */}
      {!paid && !isAdminGranted && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
          <h2 className="font-semibold text-amber-800 dark:text-amber-400 mb-3">Free Tier Limits</h2>
          <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <li>• 3 projects maximum</li>
            <li>• 5 clients maximum</li>
            <li>• 60 AI messages per month (WhatsApp + in-app combined)</li>
            <li>• 4 web searches per month</li>
            <li>• 10 price book items</li>
            <li>• Proposals, Stripe Connect, and calendar notifications locked</li>
          </ul>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
            Upgrade to Premium for unlimited access.
          </p>
        </div>
      )}

      {/* Feature comparison */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Plan Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                <th className="pb-2 pr-4">Feature</th>
                <th className="pb-2 pr-4 text-center">Free</th>
                <th className="pb-2 pr-4 text-center text-emerald-600">Premium</th>
                <th className="pb-2 text-center text-blue-600">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {[
                ["Projects", "3", "Unlimited", "Unlimited"],
                ["Clients", "5", "Unlimited", "Unlimited"],
                ["AI messages/month", "60", "Unlimited", "Unlimited"],
                ["Web searches/month", "4", "Unlimited", "Unlimited"],
                ["Price book items", "10", "Unlimited", "Unlimited"],
                ["Invoices & PDFs", "✓", "✓", "✓"],
                ["Stripe Connect", "✗", "✓", "✓"],
                ["Proposals", "✗", "✓", "✓"],
                ["Client subscriptions", "✗", "✓", "✓"],
                ["Calendar notifications", "✗", "✓", "✓"],
                ["WhatsApp instances", "1", "1", "1 per member"],
                ["Team members", "✗", "✗", "Owner + 1+"],
              ].map(([feature, free, premium, team]) => (
                <tr key={feature}>
                  <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{feature}</td>
                  <td className="py-2 pr-4 text-center text-slate-500">{free}</td>
                  <td className="py-2 pr-4 text-center text-slate-700 dark:text-slate-300">{premium}</td>
                  <td className="py-2 text-center text-slate-700 dark:text-slate-300">{team}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-4 text-slate-900 dark:text-white">Price</td>
                <td className="py-2 pr-4 text-center text-slate-500">Free</td>
                <td className="py-2 pr-4 text-center text-emerald-600">$29/mo</td>
                <td className="py-2 text-center text-blue-600">$49/mo</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Annual billing saves ~17%. Extra seats for Premium Team: +$10/seat/mo.
          Sales tax applied at checkout based on your location.
        </p>
      </div>
    </div>
  );
}
