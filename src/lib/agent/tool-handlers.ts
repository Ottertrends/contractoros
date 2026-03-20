import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    case "create_project": {
      const nameVal = String(input.name ?? "").trim();
      if (!nameVal) return jsonResult({ error: "name is required" });

      const quoted =
        typeof input.quoted_amount === "number"
          ? input.quoted_amount
          : input.quoted_amount != null
            ? Number(input.quoted_amount)
            : null;

      const row = {
        user_id: userId,
        name: nameVal,
        client_name: input.client_name != null ? String(input.client_name) : null,
        location: input.location != null ? String(input.location) : null,
        address: input.address != null ? String(input.address) : null,
        city: input.city != null ? String(input.city) : null,
        state: input.state != null ? String(input.state) : null,
        notes: input.notes != null ? String(input.notes) : null,
        current_work:
          input.current_work != null ? String(input.current_work) : null,
        quoted_amount:
          quoted != null && Number.isFinite(quoted) ? String(quoted) : null,
        status: "active" as ProjectStatus,
      };

      const { data, error } = await admin
        .from("projects")
        .insert(row)
        .select("id, name, client_name, location, quoted_amount")
        .single();

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, project: data });
    }

    case "update_project": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });

      const patch: Record<string, unknown> = {};

      if (input.name != null) patch.name = String(input.name);
      if (input.client_name != null)
        patch.client_name = String(input.client_name);
      if (input.location != null) patch.location = String(input.location);
      if (input.address != null) patch.address = String(input.address);
      if (input.city != null) patch.city = String(input.city);
      if (input.state != null) patch.state = String(input.state);
      if (input.status != null) patch.status = String(input.status);
      if (input.current_work != null)
        patch.current_work = String(input.current_work);
      if (input.quoted_amount != null) {
        const q = Number(input.quoted_amount);
        if (Number.isFinite(q)) patch.quoted_amount = String(q);
      }

      if (input.notes != null) {
        const { data: existing } = await admin
          .from("projects")
          .select("notes")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single();
        const prev =
          existing?.notes && typeof existing.notes === "string"
            ? existing.notes
            : "";
        const add = String(input.notes).trim();
        patch.notes = prev ? `${prev}\n${add}` : add;
      }

      if (input.city != null || input.state != null) {
        const city = patch.city != null ? String(patch.city) : null;
        const state = patch.state != null ? String(patch.state) : null;
        if (city || state) {
          patch.location = [city, state].filter(Boolean).join(", ");
        }
      }

      const { data, error } = await admin
        .from("projects")
        .update(patch)
        .eq("id", projectId)
        .eq("user_id", userId)
        .select("id, name, status, notes, current_work, quoted_amount")
        .single();

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, project: data });
    }

    case "list_projects": {
      let q = admin
        .from("projects")
        .select("id, name, client_name, location, status, quoted_amount, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (input.status != null) {
        q = q.eq("status", String(input.status));
      }
      if (input.search != null && String(input.search).trim()) {
        const term = `%${String(input.search).trim()}%`;
        q = q.or(
          `name.ilike.${term},client_name.ilike.${term},location.ilike.${term}`,
        );
      }

      const { data, error } = await q.limit(50);
      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, projects: data ?? [] });
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
      if (pErr || !project)
        return jsonResult({ error: pErr?.message ?? "Project not found" });

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

      return jsonResult({
        ok: true,
        project,
        invoices: invoices ?? [],
        invoice_items: items,
      });
    }

    case "create_invoice_draft": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });

      const { data: project, error: pErr } = await admin
        .from("projects")
        .select("id, name")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      if (pErr || !project)
        return jsonResult({ error: "Project not found" });

      const rawItems = Array.isArray(input.items) ? input.items : [];
      let subtotal = 0;
      const lineRows: {
        description: string;
        quantity: string;
        unit_price: string;
        total: string;
        sort_order: number;
      }[] = [];

      rawItems.forEach((item, idx) => {
        if (!item || typeof item !== "object") return;
        const o = item as Record<string, unknown>;
        const desc = String(o.description ?? "");
        const qty = Number(o.quantity ?? 0);
        const unit = Number(o.unit_price ?? 0);
        const lineTotal = qty * unit;
        subtotal += lineTotal;
        lineRows.push({
          description: desc,
          quantity: String(qty),
          unit_price: String(unit),
          total: String(lineTotal),
          sort_order: idx,
        });
      });

      if (lineRows.length === 0) {
        return jsonResult({ error: "At least one line item is required" });
      }

      // Sequential invoice number: INV-001, INV-002, …
      const { count: invCount } = await admin
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      const invoice_number = `INV-${String((invCount ?? 0) + 1).padStart(3, "0")}`;
      const notes =
        input.notes != null ? String(input.notes) : null;

      const { data: invoice, error: iErr } = await admin
        .from("invoices")
        .insert({
          project_id: projectId,
          user_id: userId,
          invoice_number,
          status: "draft",
          subtotal: String(subtotal),
          tax_rate: "0",
          tax_amount: "0",
          total: String(subtotal),
          notes,
        })
        .select("id, invoice_number, total, status")
        .single();

      if (iErr || !invoice)
        return jsonResult({ error: iErr?.message ?? "Insert failed" });

      const itemsPayload = lineRows.map((r) => ({
        ...r,
        invoice_id: invoice.id,
      }));

      const { error: liErr } = await admin
        .from("invoice_items")
        .insert(itemsPayload);
      if (liErr) return jsonResult({ error: liErr.message });

      return jsonResult({
        ok: true,
        invoice,
        project_name: project.name,
      });
    }

    default:
      return jsonResult({ error: `Unknown tool: ${name}` });
  }
}
