import Stripe from "stripe";

// Lazy singleton — not instantiated at module load time so a missing
// STRIPE_SECRET_KEY env var doesn't crash the Next.js build.
// Routes call getStripe() inside their handlers; it throws at runtime if unset.
let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY env var");
    _stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}
