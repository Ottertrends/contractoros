export type PlanValue =
  | "basic"
  | "premium"
  | "premium_team"
  | "free_premium"
  | "free_premium_team"
  | "discounted_premium"
  | "discounted_premium_team"
  // Legacy — kept for backward compat
  | "standard"
  | "discounted"
  | "free"
  | "paid";

export type SubscriptionProfile = {
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_seats?: number | null;
};

/** Normalize legacy plan values to new system */
export function normalizePlan(plan: string | null | undefined): PlanValue {
  if (!plan) return "basic";
  if (plan === "standard" || plan === "paid") return "premium";
  if (plan === "free") return "free_premium";
  if (plan === "discounted") return "discounted_premium";
  return plan as PlanValue;
}

/** Returns true for any paid or admin-granted premium access */
export function isPremium(profile: SubscriptionProfile): boolean {
  const plan = normalizePlan(profile.subscription_plan);
  const status = profile.subscription_status ?? "none";
  const activeStripe = ["active", "trialing"].includes(status);
  const adminGranted = plan === "free_premium" || plan === "free_premium_team";
  const paidPlan = ["premium", "premium_team", "discounted_premium", "discounted_premium_team"].includes(plan);
  return adminGranted || (paidPlan && activeStripe);
}

/** Returns true only for Premium Team tier */
export function isPremiumTeam(profile: SubscriptionProfile): boolean {
  const plan = normalizePlan(profile.subscription_plan);
  const status = profile.subscription_status ?? "none";
  const activeStripe = ["active", "trialing"].includes(status);
  const adminGranted = plan === "free_premium_team";
  const paidTeam = ["premium_team", "discounted_premium_team"].includes(plan);
  return adminGranted || (paidTeam && activeStripe);
}

export function isFreeTier(profile: SubscriptionProfile): boolean {
  return !isPremium(profile);
}

/** Backwards-compat alias */
export function isPaidUser(profile: SubscriptionProfile): boolean {
  return isPremium(profile);
}

// ── Feature limits ──────────────────────────────────────────────────────────

export function maxProjects(profile: SubscriptionProfile): number {
  return isPremium(profile) ? Infinity : 3;
}

export function maxClients(profile: SubscriptionProfile): number {
  return isPremium(profile) ? Infinity : 5;
}

export function maxMonthlyMessages(profile: SubscriptionProfile): number {
  return isPremium(profile) ? Infinity : 60;
}

export function maxMonthlySearches(profile: SubscriptionProfile): number {
  return isPremium(profile) ? Infinity : 4;
}

export function maxPriceBookItems(profile: SubscriptionProfile): number {
  return isPremium(profile) ? Infinity : 10;
}

export function canUseStripeConnect(profile: SubscriptionProfile): boolean {
  return isPremium(profile);
}

export function canUseClientSubscriptions(profile: SubscriptionProfile): boolean {
  return isPremium(profile);
}

export function canUseProposals(profile: SubscriptionProfile): boolean {
  return isPremium(profile);
}

/** Calendar notifications gated behind Premium */
export function canUseCalendarNotifications(profile: SubscriptionProfile): boolean {
  return isPremium(profile);
}

export function canUseTeam(profile: SubscriptionProfile): boolean {
  return isPremiumTeam(profile);
}

/**
 * Max total seats (owner + members).
 * Base: 2 (owner + 1 member). Extra seats purchased via Stripe add-on.
 * Admin free_premium_team: unlimited.
 */
export function maxTeamSeats(profile: SubscriptionProfile): number {
  if (!isPremiumTeam(profile)) return 0;
  const plan = normalizePlan(profile.subscription_plan);
  if (plan === "free_premium_team") return Infinity;
  return 2 + (profile.subscription_seats ?? 0);
}
