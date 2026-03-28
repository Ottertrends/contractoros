import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isPaidUser } from "@/lib/billing/access";
import { BillingActions } from "./BillingActions";

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_plan, subscription_started_at, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const paid = isPaidUser(profile ?? {});
  const adminFree = profile?.subscription_plan === "free";
  const status = profile?.subscription_status ?? "none";
  const plan = profile?.subscription_plan ?? "standard";

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscription</h1>

      {/* Status card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500 mb-1">Current Plan</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              {adminFree
                ? "Free (Complimentary)"
                : plan === "discounted"
                ? "Standard — 50% Discount"
                : "Standard — $50/month"}
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              paid
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : status === "past_due"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {adminFree
              ? "Active"
              : status === "active"
              ? "Active"
              : status === "past_due"
              ? "Past Due"
              : status === "canceled"
              ? "Canceled"
              : "Free Tier"}
          </span>
        </div>

        {profile?.subscription_started_at && (
          <p className="text-sm text-slate-500">
            Subscriber since{" "}
            {new Date(profile.subscription_started_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}

        {!adminFree && (
          <BillingActions
            paid={paid}
            hasStripeCustomer={!!profile?.stripe_customer_id}
            plan={plan}
          />
        )}
      </div>

      {/* Free tier limits */}
      {!paid && !adminFree && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
          <h2 className="font-semibold text-amber-800 dark:text-amber-400 mb-3">Free Tier Limits</h2>
          <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <li>• 1 project maximum</li>
            <li>• 5 web chat messages per month</li>
            <li>• Invoice PDF download not available</li>
            <li>• Web price search not available</li>
          </ul>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
            Upgrade to Standard for unlimited access.
          </p>
        </div>
      )}

      {/* Features table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Standard Plan — $50/month</h2>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
          {[
            "Unlimited projects",
            "Unlimited WhatsApp messages",
            "Invoice PDF downloads",
            "Web price search (Tavily)",
            "Material price lookups via AI",
            "Client & price book management",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-emerald-500">&#10003;</span> {f}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400 mt-4">
          Sales tax applied automatically at checkout based on your location.
        </p>
      </div>
    </div>
  );
}
