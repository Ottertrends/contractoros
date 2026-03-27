/**
 * Application-layer draft invoice sync.
 *
 * This mirrors the DB trigger in 003_draft_invoice_sync.sql so the feature
 * works immediately — once the migration is applied the trigger takes over
 * and these helpers become a safety net for cases the trigger misses
 * (e.g. direct API calls, tests).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Project } from "@/lib/types/database";

/** Ensure a draft invoice exists for the project and return its id. */
export async function ensureDraftInvoice(
  admin: SupabaseClient,
  userId: string,
  project: Pick<Project, "id" | "name" | "notes" | "current_work" | "quoted_amount">,
): Promise<string | null> {
  // Check for existing draft
  const { data: existingDraft } = await admin
    .from("invoices")
    .select("id")
    .eq("project_id", project.id)
    .eq("status", "draft")
    .maybeSingle();

  if (existingDraft?.id) return existingDraft.id;

  // Don't create a new draft if any non-cancelled invoice already exists (sent/paid)
  // This prevents duplicate invoices when project is updated after invoice is sent/paid
  const { data: anyInvoice } = await admin
    .from("invoices")
    .select("id")
    .eq("project_id", project.id)
    .neq("status", "cancelled")
    .maybeSingle();

  if (anyInvoice?.id) return null; // project already has an active invoice, don't create draft

  // Use MAX existing invoice number to prevent gaps/duplicates after deletions
  const { data: allNums } = await admin
    .from("invoices")
    .select("invoice_number")
    .eq("user_id", userId);

  const maxNum = (allNums ?? []).reduce((max, inv) => {
    const match = (inv.invoice_number ?? "").match(/(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(max, n);
  }, 0);

  const invoice_number = `INV-${String(maxNum + 1).padStart(3, "0")}`;
  const quoted = Number(project.quoted_amount ?? 0);

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .insert({
      project_id: project.id,
      user_id: userId,
      invoice_number,
      status: "draft",
      subtotal: String(quoted),
      tax_rate: "0",
      tax_amount: "0",
      total: String(quoted),
      notes: project.notes ?? null,
      date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .maybeSingle();

  if (invErr || !inv) {
    console.error("[sync-draft] ensureDraftInvoice insert error:", invErr?.message);
    return null;
  }

  // Seed first line item
  await admin.from("invoice_items").insert({
    invoice_id: inv.id,
    name: project.name,
    description: project.current_work ?? project.name,
    quantity: "1",
    unit_price: String(quoted),
    total: String(quoted),
    sort_order: 0,
  });

  return inv.id;
}

/** Sync draft invoice (and primary line item) from updated project data. */
export async function syncDraftFromProject(
  admin: SupabaseClient,
  userId: string,
  project: Pick<Project, "id" | "name" | "notes" | "current_work" | "quoted_amount">,
): Promise<void> {
  const quoted = Number(project.quoted_amount ?? 0);

  // Upsert: get existing draft or create one
  const invoiceId = await ensureDraftInvoice(admin, userId, project);
  if (!invoiceId) return;

  // Sync invoice totals + notes
  await admin
    .from("invoices")
    .update({
      subtotal: String(quoted),
      total: String(quoted), // simplified: no tax recalc here; trigger handles it
      notes: project.notes ?? null,
    })
    .eq("id", invoiceId)
    .eq("status", "draft"); // never touch sent/paid invoices

  // Sync primary line item (sort_order = 0) — preserves quantity edits
  const { data: primaryItem } = await admin
    .from("invoice_items")
    .select("id, quantity")
    .eq("invoice_id", invoiceId)
    .eq("sort_order", 0)
    .maybeSingle();

  if (primaryItem) {
    const qty = Number(primaryItem.quantity ?? 1);
    await admin
      .from("invoice_items")
      .update({
        name: project.name,
        description: project.current_work ?? project.name,
        unit_price: String(quoted),
        total: String(qty * quoted),
      })
      .eq("id", primaryItem.id);
  } else {
    // Re-seed if item was deleted
    await admin.from("invoice_items").insert({
      invoice_id: invoiceId,
      name: project.name,
      description: project.current_work ?? project.name,
      quantity: "1",
      unit_price: String(quoted),
      total: String(quoted),
      sort_order: 0,
    });
  }
}
