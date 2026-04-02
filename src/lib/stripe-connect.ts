import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

export async function createConnectExpressAccount(params: {
  userId: string;
  email: string;
}): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: params.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { supabase_user_id: params.userId },
  });
  return account.id;
}

export async function createAccountOnboardingLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });
  return link.url;
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
