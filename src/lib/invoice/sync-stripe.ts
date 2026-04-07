import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SyncStripeResult {
  stripe_invoice_id: string;
  hosted_url: string;
}

/**
 * Creates or re-syncs a Stripe Invoice for an existing WorkSupp invoice.
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

  // 2. Fetch user profile (need stripe_connect_account_id + client email)
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

  // 3. Fetch project for client email
  const { data: project } = await supabase
    .from("projects")
    .select("client_name, id")
    .eq("id", invoice.project_id)
    .single();

  // 4. Fetch client email if available
  let clientEmail: string | undefined;
  if (project) {
    const { data: client } = await supabase
      .from("clients")
      .select("email")
      .eq("user_id", userId)
      .ilike("client_name", project.client_name ?? "")
      .maybeSingle();
    clientEmail = client?.email ?? undefined;
  }

  const stripe = getStripe();
  const stripeOptions = { stripeAccount: connectedAccountId };

  // 5. Upsert Stripe Customer (idempotent via email lookup)
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

  // 6. If re-syncing, void the old Stripe invoice first
  const existingStripeInvoiceId = (invoice as Record<string, unknown>).stripe_invoice_id as string | null;
  if (existingStripeInvoiceId) {
    try {
      await stripe.invoices.voidInvoice(existingStripeInvoiceId, undefined, stripeOptions);
    } catch {
      // ignore — invoice may already be voided or paid
    }
  }

  // 7. Create Stripe InvoiceItems for each line item
  const invoiceItemIds: string[] = [];
  for (const item of items ?? []) {
    const cents = Math.round((parseFloat(item.unit_price) || 0) * 100);
    if (cents < 1) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ii = await (stripe.invoiceItems.create as any)(
      {
        ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
        currency: "usd",
        unit_amount: cents,
        quantity: Math.max(1, Math.round(parseFloat(item.quantity) || 1)),
        description: item.description || item.name || "Service",
        metadata: { worksupp_invoice_item_id: item.id },
      },
      stripeOptions,
    ) as Awaited<ReturnType<typeof stripe.invoiceItems.create>>;
    invoiceItemIds.push(ii.id);
  }

  // 8. Create the Stripe Invoice
  const automaticTaxEnabled = !!(invoice as Record<string, unknown>).automatic_tax_enabled;

  let stripeInvoice = await stripe.invoices.create(
    {
      customer: stripeCustomerId ?? undefined,
      auto_advance: false,
      automatic_tax: { enabled: automaticTaxEnabled },
      metadata: { worksupp_invoice_id: invoiceId, worksupp_user_id: userId },
      description: `Invoice ${invoice.invoice_number ?? invoiceId}`,
    },
    {
      ...stripeOptions,
      idempotencyKey: `worksupp_sync_${invoiceId}`,
    },
  );

  // 9. Finalize to get hosted_invoice_url
  stripeInvoice = await stripe.invoices.finalizeInvoice(
    stripeInvoice.id,
    undefined,
    stripeOptions,
  );

  const hostedUrl = stripeInvoice.hosted_invoice_url;
  if (!hostedUrl) {
    throw new Error("Stripe did not return a hosted invoice URL");
  }

  // 10. Update DB
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
