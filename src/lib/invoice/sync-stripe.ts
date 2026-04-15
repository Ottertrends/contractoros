import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncStripeResult {
  stripe_invoice_id: string;
  /** null on draft — populated only after finalizeAndSendStripeInvoice() */
  hosted_url: string | null;
}

/**
 * Creates or re-syncs a Stripe Invoice (as a DRAFT) for an existing WorkSupp invoice.
 * NOTE: Stripe draft invoices do NOT have a hosted_invoice_url until finalized.
 * Call finalizeAndSendStripeInvoice() when the user clicks "Send Via Stripe".
 */
export async function syncToStripe(
  invoiceId: string,
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<SyncStripeResult> {
  const supabase = supabaseClient ?? await createSupabaseServerClient();

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

  // 2. Fetch user profile (need stripe_connect_account_id) + saved tax rates for Stripe IDs
  const [{ data: profile, error: profileError }, { data: savedTaxRates }] = await Promise.all([
    supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_charges_enabled, email, company_name")
      .eq("id", userId)
      .single(),
    supabase
      .from("tax_rates")
      .select("rate, stripe_tax_rate_id")
      .eq("user_id", userId),
  ]);

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Profile not found");
  }

  const connectedAccountId = (profile as Record<string, unknown>).stripe_connect_account_id as string | null;
  if (!connectedAccountId) {
    throw new Error("Stripe account not connected. Go to Settings → Integrations to connect Stripe.");
  }
  if (!(profile as Record<string, unknown>).stripe_connect_charges_enabled) {
    throw new Error("Stripe account not fully onboarded. Complete Stripe setup to accept payments.");
  }

  // 3. Fetch project for client_email and address
  const { data: project } = await supabase
    .from("projects")
    .select("client_name, id, client_email, address, city, state, zip")
    .eq("id", (invoice as Record<string, unknown>).project_id as string)
    .single();

  // 4. Auto-tax address guard
  const automaticTaxEnabled = !!(invoice as Record<string, unknown>).automatic_tax_enabled;
  if (automaticTaxEnabled && !(project as Record<string, unknown> | null)?.address) {
    throw new Error("Address required on the project when auto-tax is enabled");
  }

  // 5. Resolve client fields from project
  const clientEmail = (project as Record<string, unknown> | null)?.client_email as string | null | undefined || undefined;
  const clientName = (project as Record<string, unknown> | null)?.client_name as string | null | undefined || undefined;
  const clientAddress = (project as Record<string, unknown> | null)?.address as string | null | undefined || undefined;
  const clientCity   = (project as Record<string, unknown> | null)?.city   as string | null | undefined || undefined;
  const clientState  = (project as Record<string, unknown> | null)?.state  as string | null | undefined || undefined;
  const clientZip    = (project as Record<string, unknown> | null)?.zip    as string | null | undefined || undefined;

  // Build Stripe address object — required for automatic_tax to calculate rates
  const stripeAddress = clientAddress
    ? {
        line1: clientAddress,
        city: clientCity || undefined,
        state: clientState || undefined,
        postal_code: clientZip || undefined,
        country: "US",
      }
    : undefined;

  const stripe = getStripe();
  const stripeOptions = { stripeAccount: connectedAccountId };

  // 6. Upsert Stripe Customer — always required by Stripe's invoiceItems.create.
  //    Always create fresh (since we void old Stripe invoices on re-sync anyway).
  //    Pass address so Stripe automatic_tax can determine the correct rates.
  let stripeCustomerId: string;
  if (clientEmail) {
    const existing = await stripe.customers.list({ email: clientEmail, limit: 1 }, stripeOptions);
    if (existing.data.length > 0) {
      // Update existing customer with latest name + address
      const updated = await stripe.customers.update(
        existing.data[0].id,
        {
          name: clientName ?? undefined,
          address: stripeAddress ?? null,
        },
        stripeOptions,
      );
      stripeCustomerId = updated.id;
    } else {
      const customer = await stripe.customers.create(
        {
          email: clientEmail,
          name: clientName ?? undefined,
          address: stripeAddress,
          metadata: { worksupp_user_id: userId },
        },
        stripeOptions,
      );
      stripeCustomerId = customer.id;
    }
  } else {
    // No email — create a customer with name + address so invoice items can be attached
    const customer = await stripe.customers.create(
      {
        name: clientName ?? "Client",
        address: stripeAddress,
        metadata: { worksupp_user_id: userId },
      },
      stripeOptions,
    );
    stripeCustomerId = customer.id;
  }

  // 7. If re-syncing, void the old Stripe invoice first
  const existingStripeInvoiceId = (invoice as Record<string, unknown>).stripe_invoice_id as string | null;
  if (existingStripeInvoiceId) {
    try {
      await stripe.invoices.voidInvoice(existingStripeInvoiceId, undefined, stripeOptions);
    } catch {
      // ignore — invoice may already be voided or paid
    }
  }

  // 8. Create Stripe Invoice as DRAFT first (so we can attach items directly to it)
  // Always use a timestamped idempotency key — avoids Stripe rejecting the same key
  // when parameters change between saves (e.g. customer added after first sync).
  const idempotencyKey = `worksupp_sync_${invoiceId}_v${Date.now()}`;

  const stripeInvoice = await stripe.invoices.create(
    {
      customer: stripeCustomerId ?? undefined,
      auto_advance: false, // stay as draft — we finalize explicitly
      collection_method: "send_invoice", // required for sendInvoice() API + no auto-charge
      days_until_due: 30, // required when collection_method is send_invoice
      automatic_tax: { enabled: automaticTaxEnabled },
      payment_settings: {
        payment_method_types: ["card", "us_bank_account"],
      },
      metadata: { worksupp_invoice_id: invoiceId, worksupp_user_id: userId },
      description: `Invoice ${(invoice as Record<string, unknown>).invoice_number ?? invoiceId}`,
    },
    { ...stripeOptions, idempotencyKey },
  );

  // 9. Create Stripe InvoiceItems attached directly to the invoice
  // Attaching via invoice: id guarantees they appear regardless of whether there's a customer
  // Cache ad-hoc tax rates to avoid re-creating for duplicate percentages
  const adHocTaxRateCache = new Map<number, string>();

  for (const item of items ?? []) {
    const cents = Math.round((parseFloat(item.unit_price) || 0) * 100);
    if (cents < 1) continue;

    // Resolve per-line tax rate → Stripe Tax Rate ID
    const lineTaxPct = parseFloat((item as Record<string, unknown>).tax_rate as string) || 0;
    const taxRateIds: string[] = [];

    if (lineTaxPct > 0) {
      // 1. Check user's saved rates for a matching Stripe Tax Rate ID
      const saved = (savedTaxRates ?? []).find(
        (r) => Math.abs(parseFloat(r.rate as string) - lineTaxPct) < 0.001 && r.stripe_tax_rate_id,
      );

      if (saved?.stripe_tax_rate_id) {
        taxRateIds.push(saved.stripe_tax_rate_id);
      } else if (adHocTaxRateCache.has(lineTaxPct)) {
        // 2. Reuse an ad-hoc rate created earlier in this loop
        taxRateIds.push(adHocTaxRateCache.get(lineTaxPct)!);
      } else {
        // 3. Create an ad-hoc Stripe TaxRate for this percentage
        try {
          const adhoc = await stripe.taxRates.create(
            { display_name: "Tax", percentage: lineTaxPct, inclusive: false },
            stripeOptions,
          );
          adHocTaxRateCache.set(lineTaxPct, adhoc.id);
          taxRateIds.push(adhoc.id);
        } catch (err) {
          console.warn("[sync-stripe] Failed to create ad-hoc tax rate:", err);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (stripe.invoiceItems.create as any)(
      {
        customer: stripeCustomerId,
        invoice: stripeInvoice.id, // attach directly — avoids orphaned pending items
        currency: "usd",
        unit_amount: cents,
        quantity: Math.max(1, Math.round(parseFloat(item.quantity) || 1)),
        description: item.description || item.name || "Service",
        ...(taxRateIds.length > 0 ? { tax_rates: taxRateIds } : {}),
        metadata: { worksupp_invoice_item_id: item.id },
      },
      stripeOptions,
    );
  }

  // NOTE: hosted_invoice_url is null on Stripe draft invoices by design.
  // It becomes available only after finalizeInvoice() is called (see finalizeAndSendStripeInvoice).

  // 10. Save stripe_invoice_id to DB (hosted_url stays null until finalized)
  await supabase
    .from("invoices")
    .update({
      stripe_invoice_id: stripeInvoice.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  return { stripe_invoice_id: stripeInvoice.id, hosted_url: null };
}

export interface FinalizeResult {
  hostedUrl: string;
  invoiceNumber: string | null;
}

/**
 * Finalizes a Stripe Invoice (draft → open).
 * Generates hosted_invoice_url + captures the human-readable invoice number (e.g. "R9ILTCJP-0013").
 * Saves both to DB and returns them.
 * Does NOT send — sending is a separate step via sendOpenStripeInvoice().
 */
export async function finalizeStripeInvoice(
  invoiceId: string,
  userId: string,
  supabaseClient?: SupabaseClient,
): Promise<FinalizeResult> {
  const supabase = supabaseClient ?? await createSupabaseServerClient();

  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase.from("invoices").select("stripe_invoice_id").eq("id", invoiceId).eq("user_id", userId).single(),
    supabase.from("profiles").select("stripe_connect_account_id").eq("id", userId).single(),
  ]);

  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) {
    throw new Error("No Stripe invoice found. Save the invoice first to sync it to Stripe.");
  }

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) {
    throw new Error("Stripe account not connected.");
  }

  const stripe = getStripe();
  const stripeOptions = { stripeAccount: connectedAccountId };

  // Finalize: draft → open (this generates the hosted_invoice_url + invoice number).
  // If the Stripe invoice is already open (e.g. user retried after a partial failure),
  // retrieve it directly to recover those values instead of throwing.
  let hostedUrl: string | null = null;
  let invoiceNumber: string | null = null;
  try {
    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoiceId, undefined, stripeOptions);
    hostedUrl = finalized.hosted_invoice_url ?? null;
    invoiceNumber = finalized.number ?? null;
  } catch (err) {
    const stripeMsg = (err as { message?: string })?.message ?? "";
    if (stripeMsg.toLowerCase().includes("not a draft") || stripeMsg.toLowerCase().includes("already")) {
      const existing = await stripe.invoices.retrieve(stripeInvoiceId, undefined, stripeOptions);
      hostedUrl = existing.hosted_invoice_url ?? null;
      invoiceNumber = existing.number ?? null;
    } else {
      throw err;
    }
  }

  if (!hostedUrl) {
    throw new Error("Stripe did not return a payment URL after finalization.");
  }

  // Save hosted URL + invoice number to DB
  await supabase
    .from("invoices")
    .update({
      stripe_hosted_url: hostedUrl,
      stripe_invoice_number: invoiceNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  return { hostedUrl, invoiceNumber };
}

/**
 * Sends an already-finalized (open) Stripe Invoice to the customer via email.
 * Returns the hosted_invoice_url (already saved in DB from finalization).
 */
export async function sendOpenStripeInvoice(
  invoiceId: string,
  userId: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase.from("invoices").select("stripe_invoice_id, stripe_hosted_url").eq("id", invoiceId).eq("user_id", userId).single(),
    supabase.from("profiles").select("stripe_connect_account_id").eq("id", userId).single(),
  ]);

  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) {
    throw new Error("No Stripe invoice found. Finalize the invoice first.");
  }

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) {
    throw new Error("Stripe account not connected.");
  }

  const stripe = getStripe();
  const stripeOptions = { stripeAccount: connectedAccountId };

  // Send the invoice email to the customer via Stripe
  await stripe.invoices.sendInvoice(stripeInvoiceId, undefined, stripeOptions);

  const hostedUrl = (invoice as Record<string, unknown> | null)?.stripe_hosted_url as string | null;
  return hostedUrl ?? "";
}

/**
 * Marks a Stripe Invoice as uncollectible.
 * Silently ignores errors (no Stripe invoice, already in terminal state, etc.).
 */
export async function markUncollectibleStripeInvoice(invoiceId: string, userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase.from("invoices").select("stripe_invoice_id").eq("id", invoiceId).eq("user_id", userId).single(),
    supabase.from("profiles").select("stripe_connect_account_id").eq("id", userId).single(),
  ]);

  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) return;

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) return;

  const stripe = getStripe();
  try {
    await stripe.invoices.markUncollectible(stripeInvoiceId, undefined, { stripeAccount: connectedAccountId });
  } catch {
    // Silently ignore
  }
}

/**
 * @deprecated Use finalizeStripeInvoice() + sendOpenStripeInvoice() separately.
 * Kept for internal compatibility during transition.
 * Finalizes and sends a Stripe Invoice in one call.
 */
export async function finalizeAndSendStripeInvoice(
  invoiceId: string,
  userId: string,
): Promise<string> {
  const { hostedUrl } = await finalizeStripeInvoice(invoiceId, userId);
  await sendOpenStripeInvoice(invoiceId, userId);
  return hostedUrl;
}

/**
 * Voids a Stripe Invoice when a WorkSupp invoice is cancelled.
 * Silently ignores errors (already voided/paid/deleted).
 */
export async function voidStripeInvoice(invoiceId: string, userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase.from("invoices").select("stripe_invoice_id").eq("id", invoiceId).eq("user_id", userId).single(),
    supabase.from("profiles").select("stripe_connect_account_id").eq("id", userId).single(),
  ]);

  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) return;

  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) return;

  const stripe = getStripe();
  try {
    await stripe.invoices.voidInvoice(stripeInvoiceId, undefined, { stripeAccount: connectedAccountId });
  } catch {
    // Silently ignore
  }
}

/**
 * Marks a Stripe Invoice as paid out-of-band (payment received outside Stripe).
 * Silently ignores errors.
 */
export async function markPaidStripeInvoice(invoiceId: string, userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase.from("invoices").select("stripe_invoice_id").eq("id", invoiceId).eq("user_id", userId).single(),
    supabase.from("profiles").select("stripe_connect_account_id").eq("id", userId).single(),
  ]);
  const stripeInvoiceId = (invoice as Record<string, unknown> | null)?.stripe_invoice_id as string | null;
  if (!stripeInvoiceId) return;
  const connectedAccountId = (profile as Record<string, unknown> | null)?.stripe_connect_account_id as string | null;
  if (!connectedAccountId) return;
  const stripe = getStripe();
  try {
    await stripe.invoices.pay(stripeInvoiceId, { paid_out_of_band: true }, { stripeAccount: connectedAccountId });
  } catch {
    // Silently ignore — may already be paid or in invalid state
  }
}
