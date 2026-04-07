import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

/**
 * Returns the Stripe Standard OAuth authorization URL.
 * The user is redirected here to connect their own Stripe account.
 */
export function createConnectOAuthLink(params: {
  userId: string;
  redirectUri: string;
}): string {
  const clientId = process.env.STRIPE_LIVE_CLIENT_ID;
  if (!clientId) throw new Error("Missing STRIPE_LIVE_CLIENT_ID env var");

  const qs = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "read_write",
    redirect_uri: params.redirectUri,
    state: params.userId,
  });

  return `https://connect.stripe.com/oauth/authorize?${qs.toString()}`;
}

export async function createInvoicePaymentLink(params: {
  connectedAccountId: string;
  invoiceId: string;
  userId: string;
  invoiceNumber: string;
  totalAmount: number;
  /** Enables US bank account (ACH) on the Payment Link — lower fees than cards. */
  includeAch?: boolean;
}): Promise<{ url: string; id: string }> {
  const stripe = getStripe();
  const cents = Math.round(params.totalAmount * 100);
  if (cents < 50) {
    throw new Error("Total too small for online payment (minimum $0.50)");
  }

  // Stripe types omit inline `price_data` on Payment Links; API accepts it (see Stripe docs).
  const lineItems = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: `Invoice ${params.invoiceNumber}`,
        },
        unit_amount: cents,
      },
      quantity: 1,
    },
  ] as unknown as Stripe.PaymentLinkCreateParams.LineItem[];

  const link = await stripe.paymentLinks.create(
    {
      line_items: lineItems,
      metadata: {
        internal_invoice_id: params.invoiceId,
        supabase_user_id: params.userId,
      },
      ...(params.includeAch
        ? { payment_method_types: ["card", "us_bank_account"] }
        : {}),
    },
    { stripeAccount: params.connectedAccountId },
  );

  if (!link.url) throw new Error("Stripe did not return payment link URL");
  return { url: link.url, id: link.id };
}
