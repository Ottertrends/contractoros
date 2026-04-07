import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SyncStripeResult {
  stripe_invoice_id: string;
  hosted_url: string;
}

/**
 * Creates or re-syncs a Stripe Invoice (as a DRAFT) for an existing WorkSupp invoice.
 * Does NOT finalize the invoice — call finalizeAndSendStripeInvoice() when sending.
 * Uses the connected Stripe account (Stripe-Account header).
 * Idempotency key: worksupp_sync_{invoiceId}
 */
export async function syncToStripe(
  invoiceId: string,
  userId: string,
): Promise<SyncStripeResult> {
  const supabase = await createSupabaseServerClient();

  // 1. Fetch invoice + line items
  const [{ data: invoice, error: invoiceError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).eq("user_id", userId).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
    ]);

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message ?? "Invoice not found");
  }
  if (itemsError) {
    throw new Error(itemsError.message);
  }

  // 2. Fetch user profile (need stripe_connect_account_id)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled, email, company_name")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profile not found");
  }

  const connectedAccountId = profile.stripe_connect_account_id as string | null;
  if (!connectedAccountId) {
    throw new Error("Stripe account not connected. Go to Settings → Integrations to connect Stripe.");
  }
  if (!profile.stripe_connect_charges_enabled) {
    throw new Error("Stripe account not fully onboarded. Complete Stripe setup to accept payments.");
  }

  // 3. Fetch project for client_email and address
  const { data: project } = await supabase
    .from("projects")
    .select("client_name, id, client_email, address, city, state, zip")
    .eq("id", invoice.project_id)
    .single();

  // 4. Auto-tax address guard
  const automaticTaxEnabled = !!(invoice as Record<string, unknown>).automatic_tax_enabled;
  if (automaticTaxEnabled && !project?.address) {
    throw new Error("Address required on the project when auto-tax is enabled");
  }

  // 5. Resolve client email directly from project.client_email
  const clientEmail = (project as Record<string, unknown> | null)?.client_email as string | undefined || undefined;

  const stripe = getStripe();
  const stripeOptions = { stripeAccount: connectedAccountId };

  // 6. Upsert Stripe Customer (idempotent via email lookup)
  let stripeCustomerId: string | undefined;
  if (clientEmail) {
    const existing = await stripe.customers.list(
      { email: clientEmail, limit: 1 },
      stripeOptions,
    );
    if (existing.data.length > 0) {
      stripeCustomerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create(
        {
          email: clientEmail,
          name: project?.client_name ?? undefined,
          metadata: { worksupp_user_id: userId },
        },
        stripeOptions,
      );
      stripeCustomerId = customer.id;
    }
  }

  // 7. If re-syncing, void the old Stripe invoice first
  const existingStripeInvoiceId = (invoice as Record<string, unknown>).stripe_invoice_id as string | null;
  const isResync = !!existingStripeInvoiceId;
  if (existingStripeInvoiceId) {
    try {
      await stripe.invoices.voidInvoice(existingStripeInvoiceId, undefined, stripeOptions);
    } catch {
      // ignore — invoice may already be voided or paid
    }
  }

  // 8. Create Stripe InvoiceItems for each line item
  for (const item of items ?? []) {
    const cents = Math.round((parseFloat(item.unit_price) || 0) * 100);
    if (cents < 1) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (stripe.invoiceItems.create as any)(
      {
        ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
        currency: "usd",
        unit_amount: cents,
        quantity: Math.max(1, Math.round(parseFloat(item.quantity) || 1)),
        description: item.description || item.name || "Service",
        metadata: { worksupp_invoice_item_id: item.id },
      },
      stripeOptions,
    );
  }

  // 9. Create the Stripe Invoice as a DRAFT (auto_advance: false = no auto-finalization)
  // On re-sync, use a versioned idempotency key so Stripe creates a fresh invoice
  // (re-using the same key would return the voided invoice instead of a new one)
  const idempotencyKey = isResync
    ? `worksupp_sync_${invoiceId}_v${Date.now()}`
    : `worksupp_sync_${invoiceId}`;

  const stripeInvoice = await stripe.invoices.create(
    {
      customer: stripeCustomerId ?? undefined,
      auto_advance: false,
      automatic_tax: { enabled: automaticTaxEnabled },
      metadata: { worksupp_invoice_id: invoiceId, worksupp_user_id: userId },
      description: `Invoice ${(invoice as Record<string, unknown>).invoice_number ?? invoiceId}`,
    },
    {
      ...stripeOptions,
      idempotencyKey,
    },
  );

  // Draft invoices include hosted_invoice_url (shows a preview to the client)
  const hostedUrl = stripeInvoice.hosted_invoice_url;
  if (!hostedUrl) {
    throw new Error("Stripe did not return a hosted invoice URL");
  }

  // 10. Update DB with draft stripe invoice info
  await supabase
    .from("invoices")
    .update({
      stripe_invoice_id: stripeInvoice.id,
      stripe_hosted_url: hostedUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  return { stripe_invoice_id: stripeInvoice.id, hosted_url: hostedUrl };
}

/**
 * Finalizes and sends a Stripe Invoice to the client.
 * Called when the user clicks "Send Invoice Via Stripe".
 * The invoice must already exist in Stripe (call syncToStripe first if needed).
 */
export async function finalizeAndSendStripeInvoice(
  invoiceId: string,
  userId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  // Fetch stripe_invoice_id and connected account
  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase
      .from("invoices")
      .select("stripe_invoice_id")
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", userId)
      .single(),
  ]);

  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) {
    throw new Error("No Stripe invoice found. Save the invoice first to generate a Stripe invoice.");
  }

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) {
    throw new Error("Stripe account not connected.");
  }

  const stripe = getStripe();
  const stripeOptions = { stripeAccount: connectedAccountId };

  // Finalize the invoice (moves it from draft → open)
  await stripe.invoices.finalizeInvoice(stripeInvoiceId, undefined, stripeOptions);

  // Send it — Stripe emails the invoice to the customer
  await stripe.invoices.sendInvoice(stripeInvoiceId, undefined, stripeOptions);
}

/**
 * Voids a Stripe Invoice.
 * Called when a WorkSupp invoice is cancelled.
 * Silently ignores errors (invoice may already be voided or paid).
 */
export async function voidStripeInvoice(
  invoiceId: string,
  userId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase
      .from("invoices")
      .select("stripe_invoice_id")
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", userId)
      .single(),
  ]);

  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) return; // nothing to void

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) return;

  const stripe = getStripe();
  try {
    await stripe.invoices.voidInvoice(stripeInvoiceId, undefined, { stripeAccount: connectedAccountId });
  } catch {
    // Silently ignore — invoice may already be voided, paid, or deleted
  }
}
