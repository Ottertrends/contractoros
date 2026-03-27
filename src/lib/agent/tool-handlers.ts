import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncDraftFromProject } from "@/lib/invoice/sync-draft";
import type { ProjectStatus } from "@/lib/types/database";

function jsonResult(data: unknown) {
  return JSON.stringify(data);
}

export async function executeTool(
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  switch (name) {
    // ── Projects ──────────────────────────────────────────────────────────────

    case "create_project": {
      const nameVal = String(input.name ?? "").trim();
      if (!nameVal) return jsonResult({ error: "name is required" });

      // ── Deduplication: if a project with the same name (case-insensitive)
      //    already exists, return it instead of creating a duplicate.
      const { data: existing } = await admin
        .from("projects")
        .select("id, name, client_name, location, status, quoted_amount")
        .eq("user_id", userId)
        .ilike("name", nameVal)
        .maybeSingle();

      if (existing) {
        return jsonResult({
          ok: true,
          project: existing,
          action: "already_exists",
          note: `Project "${existing.name}" already exists — returning existing record. Use update_project to modify it.`,
        });
      }

      const quoted =
        typeof input.quoted_amount === "number"
          ? input.quoted_amount
          : input.quoted_amount != null
            ? Number(input.quoted_amount)
            : null;

      const city = input.city != null ? String(input.city) : null;
      const state = input.state != null ? String(input.state) : null;

      const row = {
        user_id: userId,
        name: nameVal,
        client_name: input.client_name != null ? String(input.client_name) : null,
        client_phone: input.client_phone != null ? String(input.client_phone) : null,
        client_email: input.client_email != null ? String(input.client_email) : null,
        address: input.address != null ? String(input.address) : null,
        city,
        state,
        zip: input.zip != null ? String(input.zip) : null,
        location: input.location != null
          ? String(input.location)
          : [city, state].filter(Boolean).join(", ") || null,
        notes: input.notes != null ? String(input.notes) : null,
        current_work: input.current_work != null ? String(input.current_work) : null,
        quoted_amount: quoted != null && Number.isFinite(quoted) ? String(quoted) : null,
        tags: Array.isArray(input.tags) ? input.tags.map(String) : null,
        status: "active" as ProjectStatus,
      };

      const { data, error } = await admin
        .from("projects")
        .insert(row)
        .select("id, name, client_name, location, address, city, state, quoted_amount")
        .single();

      if (error) return jsonResult({ error: error.message });

      if (data) {
        await syncDraftFromProject(admin, userId, {
          id: data.id,
          name: data.name,
          notes: row.notes ?? null,
          current_work: row.current_work ?? null,
          quoted_amount: row.quoted_amount ?? null,
        });
      }

      return jsonResult({ ok: true, project: data });
    }

    case "update_project": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });

      const patch: Record<string, unknown> = {};

      if (input.name != null) patch.name = String(input.name);
      if (input.client_name != null) patch.client_name = String(input.client_name);
      if (input.client_phone != null) patch.client_phone = String(input.client_phone);
      if (input.client_email != null) patch.client_email = String(input.client_email);
      if (input.address != null) patch.address = String(input.address);
      if (input.city != null) patch.city = String(input.city);
      if (input.state != null) patch.state = String(input.state);
      if (input.zip != null) patch.zip = String(input.zip);
      if (input.status != null) patch.status = String(input.status);
      if (input.current_work != null) patch.current_work = String(input.current_work);
      if (input.quoted_amount != null) {
        const q = Number(input.quoted_amount);
        if (Number.isFinite(q)) patch.quoted_amount = String(q);
      }

      // Append to notes (never overwrite)
      if (input.notes != null) {
        const { data: existing } = await admin
          .from("projects")
          .select("notes")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single();
        const prev = typeof existing?.notes === "string" ? existing.notes : "";
        const add = String(input.notes).trim();
        patch.notes = prev ? `${prev}\n${add}` : add;
      }

      // Auto-update location when city/state change
      if (input.city != null || input.state != null) {
        const city = patch.city != null ? String(patch.city) : null;
        const state = patch.state != null ? String(patch.state) : null;
        if (city || state) patch.location = [city, state].filter(Boolean).join(", ");
      }

      const { data, error } = await admin
        .from("projects")
        .update(patch)
        .eq("id", projectId)
        .eq("user_id", userId)
        .select("id, name, status, notes, current_work, quoted_amount, location")
        .single();

      if (error) return jsonResult({ error: error.message });

      if (data) {
        await syncDraftFromProject(admin, userId, {
          id: data.id,
          name: data.name,
          notes: typeof data.notes === "string" ? data.notes : null,
          current_work: typeof data.current_work === "string" ? data.current_work : null,
          quoted_amount: typeof data.quoted_amount === "string" ? data.quoted_amount : null,
        });
      }

      return jsonResult({ ok: true, project: data });
    }

    case "list_projects": {
      const hasSearch = input.search != null && String(input.search).trim().length > 0;
      const limit = hasSearch ? 20 : 10;

      let q = admin
        .from("projects")
        .select("id, name, client_name, address, city, state, location, status, quoted_amount, current_work, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (input.status != null) {
        q = q.eq("status", String(input.status));
      }

      if (hasSearch) {
        const term = `%${String(input.search).trim()}%`;
        // Search across all useful text fields
        q = q.or(
          `name.ilike.${term},client_name.ilike.${term},location.ilike.${term},address.ilike.${term},current_work.ilike.${term},notes.ilike.${term}`,
        );
      }

      const { data, error } = await q.limit(limit);
      if (error) return jsonResult({ error: error.message });

      return jsonResult({
        ok: true,
        projects: data ?? [],
        count: (data ?? []).length,
        note: hasSearch
          ? `Search results for "${String(input.search).trim()}"`
          : "10 most recently updated projects",
      });
    }

    case "get_project_details": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });

      const { data: project, error: pErr } = await admin
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      if (pErr || !project) return jsonResult({ error: pErr?.message ?? "Project not found" });

      const { data: invoices } = await admin
        .from("invoices")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      const invoiceIds = (invoices ?? []).map((i) => i.id);
      let items: unknown[] = [];
      if (invoiceIds.length > 0) {
        const { data: invItems } = await admin
          .from("invoice_items")
          .select("*")
          .in("invoice_id", invoiceIds);
        items = invItems ?? [];
      }

      return jsonResult({ ok: true, project, invoices: invoices ?? [], invoice_items: items });
    }

    // ── Invoices ──────────────────────────────────────────────────────────────

    case "create_invoice_draft": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });

      const { data: project, error: pErr } = await admin
        .from("projects")
        .select("id, name, notes, current_work, quoted_amount")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      if (pErr || !project) return jsonResult({ error: "Project not found" });

      const rawItems = Array.isArray(input.items) ? input.items : [];
      const taxRate = typeof input.tax_rate === "number" ? input.tax_rate : 0;
      let subtotal = 0;
      const lineRows: {
        name: string | null;
        description: string;
        quantity: string;
        unit_price: string;
        total: string;
        sort_order: number;
      }[] = [];

      rawItems.forEach((item, idx) => {
        if (!item || typeof item !== "object") return;
        const o = item as Record<string, unknown>;
        const itemName = o.name != null ? String(o.name) : null;
        const desc = String(o.description ?? "");
        const qty = Number(o.quantity ?? 1);
        const unit = Number(o.unit_price ?? 0);
        const lineTotal = qty * unit;
        subtotal += lineTotal;
        lineRows.push({
          name: itemName,
          description: desc,
          quantity: String(qty),
          unit_price: String(unit),
          total: String(lineTotal),
          sort_order: idx,
        });
      });

      // Seed from project if no items provided
      if (lineRows.length === 0) {
        const quoted = Number(project.quoted_amount ?? 0);
        subtotal = quoted;
        lineRows.push({
          name: project.name,
          description: project.current_work ?? project.name,
          quantity: "1",
          unit_price: String(quoted),
          total: String(quoted),
          sort_order: 0,
        });
      }

      const taxAmount = (subtotal * taxRate) / 100;
      const total = subtotal + taxAmount;
      const notes = input.notes != null ? String(input.notes) : (project.notes ?? null);

      const { data: existingDraft } = await admin
        .from("invoices")
        .select("id, invoice_number")
        .eq("project_id", projectId)
        .eq("status", "draft")
        .maybeSingle();

      let invoiceId: string;
      let invoice_number: string;

      if (existingDraft) {
        invoiceId = existingDraft.id;
        invoice_number = existingDraft.invoice_number ?? `INV-${existingDraft.id.slice(0, 6)}`;

        await admin.from("invoices").update({
          subtotal: String(subtotal),
          tax_rate: String(taxRate),
          tax_amount: String(taxAmount),
          total: String(total),
          notes,
          date: new Date().toISOString().slice(0, 10),
        }).eq("id", invoiceId);

        await admin.from("invoice_items").delete().eq("invoice_id", invoiceId);
      } else {
        const { count: invCount } = await admin
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);
        invoice_number = `INV-${String((invCount ?? 0) + 1).padStart(3, "0")}`;

        const { data: newInv, error: iErr } = await admin
          .from("invoices")
          .insert({
            project_id: projectId,
            user_id: userId,
            invoice_number,
            status: "draft",
            subtotal: String(subtotal),
            tax_rate: String(taxRate),
            tax_amount: String(taxAmount),
            total: String(total),
            notes,
            date: new Date().toISOString().slice(0, 10),
          })
          .select("id")
          .single();

        if (iErr || !newInv) return jsonResult({ error: iErr?.message ?? "Insert failed" });
        invoiceId = newInv.id;
      }

      const { error: liErr } = await admin
        .from("invoice_items")
        .insert(lineRows.map((r) => ({ ...r, invoice_id: invoiceId })));
      if (liErr) return jsonResult({ error: liErr.message });

      return jsonResult({
        ok: true,
        invoice: { id: invoiceId, invoice_number, subtotal: String(subtotal), tax_rate: String(taxRate), total: String(total), status: "draft" },
        project_name: project.name,
        line_items: lineRows.length,
        action: existingDraft ? "updated" : "created",
      });
    }

    case "update_invoice_status": {
      const status = String(input.status ?? "").trim();
      if (!["draft", "sent", "paid", "cancelled"].includes(status)) {
        return jsonResult({ error: "status must be: draft | sent | paid | cancelled" });
      }

      const invoiceId = input.invoice_id != null ? String(input.invoice_id).trim() : null;
      const projectId = input.project_id != null ? String(input.project_id).trim() : null;

      if (!invoiceId && !projectId) {
        return jsonResult({ error: "Provide invoice_id or project_id" });
      }

      let q = admin
        .from("invoices")
        .update({ status })
        .eq("user_id", userId);

      if (invoiceId) {
        q = q.eq("id", invoiceId);
      } else {
        // Update the most recent invoice for this project
        const { data: latest } = await admin
          .from("invoices")
          .select("id")
          .eq("project_id", projectId!)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (!latest) return jsonResult({ error: "No invoice found for this project" });
        q = q.eq("id", latest.id);
      }

      const { data, error } = await q
        .select("id, invoice_number, status, total, project_id")
        .single();

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, invoice: data });
    }

    // ── Clients ───────────────────────────────────────────────────────────────

    case "list_clients": {
      let q = admin
        .from("clients")
        .select("id, client_name, address, city, state, zip, phone, email, notes")
        .eq("user_id", userId)
        .order("client_name");

      if (input.search != null && String(input.search).trim()) {
        const term = `%${String(input.search).trim()}%`;
        q = q.or(
          `client_name.ilike.${term},address.ilike.${term},phone.ilike.${term},email.ilike.${term},city.ilike.${term}`,
        );
      }

      const { data, error } = await q.limit(20);
      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, clients: data ?? [], count: (data ?? []).length });
    }

    case "save_client": {
      const clientName = String(input.client_name ?? "").trim();
      if (!clientName) return jsonResult({ error: "client_name is required" });

      // Check if client already exists by name
      const { data: existing } = await admin
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .eq("client_name", clientName)
        .maybeSingle();

      const fields: Record<string, string | null> = {
        user_id: userId,
        client_name: clientName,
      };
      if (input.address != null) fields.address = String(input.address);
      if (input.city != null) fields.city = String(input.city);
      if (input.state != null) fields.state = String(input.state);
      if (input.zip != null) fields.zip = String(input.zip);
      if (input.phone != null) fields.phone = String(input.phone);
      if (input.email != null) fields.email = String(input.email);
      if (input.notes != null) fields.notes = String(input.notes);

      if (existing) {
        const { data, error } = await admin
          .from("clients")
          .update(fields)
          .eq("id", existing.id)
          .select("id, client_name, phone, email")
          .single();
        if (error) return jsonResult({ error: error.message });
        return jsonResult({ ok: true, client: data, action: "updated" });
      } else {
        const { data, error } = await admin
          .from("clients")
          .insert(fields)
          .select("id, client_name, phone, email")
          .single();
        if (error) return jsonResult({ error: error.message });
        return jsonResult({ ok: true, client: data, action: "created" });
      }
    }

    // ── Price Book ────────────────────────────────────────────────────────────

    case "list_price_book": {
      let q = admin
        .from("price_book")
        .select("id, item_name, description, unit, unit_price, category, supplier")
        .eq("user_id", userId)
        .order("category")
        .order("item_name");

      if (input.search != null && String(input.search).trim()) {
        const term = `%${String(input.search).trim()}%`;
        q = q.or(
          `item_name.ilike.${term},category.ilike.${term},description.ilike.${term},supplier.ilike.${term}`,
        );
      }

      const { data, error } = await q.limit(50);
      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, items: data ?? [], count: (data ?? []).length });
    }

    case "add_price_book_item": {
      const itemName = String(input.item_name ?? "").trim();
      if (!itemName) return jsonResult({ error: "item_name is required" });

      const unitPrice = Number(input.unit_price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return jsonResult({ error: "unit_price must be a non-negative number" });
      }

      const row: Record<string, unknown> = {
        user_id: userId,
        item_name: itemName,
        unit_price: String(unitPrice),
      };
      if (input.description != null) row.description = String(input.description);
      if (input.unit != null) row.unit = String(input.unit);
      if (input.category != null) row.category = String(input.category);
      if (input.supplier != null) row.supplier = String(input.supplier);

      const { data, error } = await admin
        .from("price_book")
        .insert(row)
        .select("id, item_name, unit_price, unit, category")
        .single();

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, item: data, action: "created" });
    }

    // ── Memory ────────────────────────────────────────────────────────────────

    case "update_memory": {
      const content = String(input.memory_text ?? "").trim();
      if (!content) return jsonResult({ error: "memory_text is required" });

      const { error } = await admin
        .from("agent_memory")
        .upsert(
          { user_id: userId, memory_text: content, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, message: "Memory updated successfully" });
    }

    // ── Media ─────────────────────────────────────────────────────────────────

    case "attach_media_to_project": {
      const mediaId = String(input.media_id ?? "").trim();
      const projectId = String(input.project_id ?? "").trim();
      if (!mediaId || !projectId) {
        return jsonResult({ error: "media_id and project_id are required" });
      }

      const patch: Record<string, unknown> = { project_id: projectId };
      if (input.description != null) patch.description = String(input.description);

      const { error } = await admin
        .from("project_media")
        .update(patch)
        .eq("id", mediaId)
        .eq("user_id", userId);

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, media_id: mediaId, project_id: projectId });
    }

    default:
      return jsonResult({ error: `Unknown tool: ${name}` });
  }
}
