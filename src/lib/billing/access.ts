export type SubscriptionProfile = {
  subscription_status?: string | null;
  subscription_plan?: string | null;
};

export function isPaidUser(profile: SubscriptionProfile): boolean {
  if (profile.subscription_plan === "free") return true; // admin-granted full access
  if (profile.subscription_plan === "paid") return true; // auto-set by Stripe webhook
  return ["active", "trialing"].includes(profile.subscription_status ?? "");
}

export function isFreeTier(profile: SubscriptionProfile): boolean {
  return !isPaidUser(profile);
}
