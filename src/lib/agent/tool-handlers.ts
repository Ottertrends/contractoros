import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncDraftFromProject } from "@/lib/invoice/sync-draft";
import { syncRecurringRuleToGoogle, deleteGoogleEventForRule } from "@/lib/integrations/google-calendar-sync";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/agent/model";
import type { ProjectStatus } from "@/lib/types/database";
import type { ContentBlock, ProposalLineItem } from "@/lib/types/proposals";

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

      // ── Free tier limit: max 1 project ────────────────────────────────────
      const { data: subProfile } = await admin
        .from("profiles")
        .select("subscription_plan, subscription_status")
        .eq("id", userId)
        .maybeSingle();

      const isPaid =
        subProfile?.subscription_plan === "free" ||
        ["active", "trialing"].includes(subProfile?.subscription_status ?? "");

      if (!isPaid) {
        const { count: projectCount } = await admin
          .from("projects")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);

        if ((projectCount ?? 0) >= 1) {
          return jsonResult({
            error:
              "Free plan is limited to 1 project. Upgrade to Standard at worksup.vercel.app/dashboard/billing to add more.",
          });
        }
      }

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
        const { data: allNums } = await admin
          .from("invoices")
          .select("invoice_number")
          .eq("user_id", userId);
        const maxNum = (allNums ?? []).reduce((max: number, inv: { invoice_number: string | null }) => {
          const match = (inv.invoice_number ?? "").match(/(\d+)$/);
          const n = match ? parseInt(match[1], 10) : 0;
          return Math.max(max, n);
        }, 0);
        invoice_number = `INV-${String(maxNum + 1).padStart(3, "0")}`;

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

    // ── Web Search ────────────────────────────────────────────────────────────

    case "web_search": {
      const rawQuery = String(input.query ?? "").trim();
      if (!rawQuery) return jsonResult({ error: "query is required" });

      // ── Free tier: web search not available ───────────────────────────────
      const { data: wsProfile } = await admin
        .from("profiles")
        .select("subscription_plan, subscription_status")
        .eq("id", userId)
        .maybeSingle();

      const wsIsPaid =
        wsProfile?.subscription_plan === "free" ||
        ["active", "trialing"].includes(wsProfile?.subscription_status ?? "");

      if (!wsIsPaid) {
        return jsonResult({
          error:
            "Web search is available on the Standard plan ($50/month). Upgrade at worksup.vercel.app/dashboard/billing",
        });
      }

      const apiKey = process.env.TAVILY_API_KEY?.trim();
      if (!apiKey) return jsonResult({ error: "Web search is not configured (missing TAVILY_API_KEY)" });

      // Amazon Associates affiliate tag — injected into amazon.com URLs before returning to Claude
      const amazonTag = process.env.AMAZON_AFFILIATE_TAG?.trim() ?? null;
      const injectAmazonTag = (url: string): string => {
        if (!amazonTag || !url.includes("amazon.com")) return url;
        try {
          const u = new URL(url);
          u.searchParams.set("tag", amazonTag);
          return u.toString();
        } catch { return url; }
      };

      // Fetch contractor's zip code from profile for local search context
      const includeZip = input.include_zip !== false; // default true
      let zip: string | null = null;
      if (includeZip) {
        const { data: prof } = await admin
          .from("profiles")
          .select("zip, city, state")
          .eq("id", userId)
          .maybeSingle();
        zip = prof?.zip ?? null;
        // Build location suffix: zip preferred, fallback to city+state
        if (!zip && prof?.city) {
          zip = [prof.city, prof.state].filter(Boolean).join(", ");
        }
      }

      const finalQuery = zip ? `${rawQuery} near ${zip}` : rawQuery;

      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query: finalQuery,
            search_depth: "basic",
            max_results: 6,
            include_answer: true,
            include_raw_content: false,
            include_images: false,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return jsonResult({ error: `Tavily error ${res.status}: ${errText.slice(0, 200)}` });
        }

        const data = await res.json() as {
          answer?: string;
          results?: { title: string; url: string; content: string; score: number }[];
        };

        const results = (data.results ?? []).map((r) => ({
          title: r.title,
          url: injectAmazonTag(r.url),  // affiliate tag injected for amazon.com URLs
          snippet: r.content.slice(0, 400),
        }));

        // Track Tavily usage
        const today = new Date().toISOString().slice(0, 10);
        void Promise.resolve(
          admin.rpc("increment_usage", {
            p_user_id: userId,
            p_date: today,
            p_input: 0,
            p_output: 0,
            p_tavily: 1,
            p_web_messages: 0,
          })
        ).catch((err: unknown) => console.warn("[tool-handlers] tavily usage tracking failed:", err));

        return jsonResult({
          ok: true,
          query: finalQuery,
          answer: data.answer ?? null,
          results,
          note: zip ? `Search localized to zip/area: ${zip}` : "General search (no zip on profile)",
          amazon_affiliate_active: !!amazonTag,  // signals Claude to add disclosure when sharing Amazon links
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return jsonResult({ error: `Search failed: ${msg}` });
      }
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    case "delete_project": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });
      if (!input.confirmed) return jsonResult({ error: "confirmed must be true — ask the contractor to confirm deletion first" });

      // Verify the project belongs to this user
      const { data: proj } = await admin
        .from("projects")
        .select("id, name")
        .eq("id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!proj) return jsonResult({ error: "Project not found or access denied" });

      // Get invoice IDs so we can delete their line items
      const { data: invRows } = await admin
        .from("invoices")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", userId);

      const invoiceIds = (invRows ?? []).map((i) => i.id);

      // Delete invoice items
      if (invoiceIds.length > 0) {
        await admin.from("invoice_items").delete().in("invoice_id", invoiceIds);
      }

      // Delete invoices
      await admin.from("invoices").delete().eq("project_id", projectId).eq("user_id", userId);

      // Delete project media records
      await admin.from("project_media").delete().eq("project_id", projectId).eq("user_id", userId);

      // Delete the project
      const { error } = await admin.from("projects").delete().eq("id", projectId).eq("user_id", userId);
      if (error) return jsonResult({ error: error.message });

      return jsonResult({ ok: true, deleted: { project_id: projectId, project_name: proj.name }, invoices_deleted: invoiceIds.length });
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

    // ── Calendar / Recurring Events ──────────────────────────────────────────

    case "list_calendar_events": {
      const { data: rules, error } = await admin
        .from("recurring_projects")
        .select("id, project_id, recurrence_type, day_of_week, interval_days, day_of_month, manual_dates, next_occurrence, event_time, notes, projects(name)")
        .eq("user_id", userId)
        .eq("active", true)
        .order("next_occurrence", { ascending: true })
        .limit(20);

      if (error) return jsonResult({ error: error.message });
      const events = (rules ?? []).map((r) => ({
        id: r.id,
        project_name: (r.projects as { name?: string | null } | null)?.name ?? null,
        project_id: r.project_id,
        recurrence_type: r.recurrence_type,
        day_of_week: r.day_of_week,
        interval_days: r.interval_days,
        day_of_month: r.day_of_month,
        manual_dates: r.manual_dates,
        next_occurrence: r.next_occurrence,
        event_time: r.event_time,
        notes: r.notes,
      }));
      return jsonResult({ ok: true, events, count: events.length });
    }

    case "create_calendar_event": {
      const projectId = String(input.project_id ?? "").trim();
      const recurrenceType = String(input.recurrence_type ?? "").trim() as "weekly" | "interval" | "monthly" | "manual";
      if (!projectId) return jsonResult({ error: "project_id is required" });
      if (!["weekly", "interval", "monthly", "manual"].includes(recurrenceType)) {
        return jsonResult({ error: "recurrence_type must be one of: weekly, interval, monthly, manual" });
      }

      const manualDates = Array.isArray(input.manual_dates) ? (input.manual_dates as string[]) : null;
      if (recurrenceType === "manual" && (!manualDates || manualDates.length === 0)) {
        return jsonResult({ error: "manual_dates (array of YYYY-MM-DD) required for manual type" });
      }

      const today = new Date().toISOString().slice(0, 10);
      const startDate = input.start_date ? String(input.start_date) : today;
      const dayOfWeek = typeof input.day_of_week === "number" ? input.day_of_week : null;
      const intervalDays = typeof input.interval_days === "number" ? input.interval_days : null;
      const dayOfMonth = typeof input.day_of_month === "number" ? input.day_of_month : null;

      // Inline computeFirstOccurrence (mirrors logic in /api/recurring/route.ts)
      function computeFirstOccurrence(): string {
        const start = new Date(startDate + "T00:00:00");
        if (recurrenceType === "weekly" && dayOfWeek != null) {
          const d = new Date(start);
          while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        }
        if (recurrenceType === "interval") {
          const d = new Date(start);
          if (d.getDay() === 0) d.setDate(d.getDate() + 1); // skip Sunday
          return d.toISOString().slice(0, 10);
        }
        if (recurrenceType === "monthly" && dayOfMonth != null) {
          const d = new Date(start);
          d.setDate(dayOfMonth);
          if (d < start) d.setMonth(d.getMonth() + 1);
          return d.toISOString().slice(0, 10);
        }
        if (recurrenceType === "manual" && manualDates?.length) {
          const sorted = [...manualDates].sort();
          const future = sorted.find((d) => d >= today);
          return future ?? sorted[sorted.length - 1];
        }
        return startDate;
      }

      const nextOccurrence = computeFirstOccurrence();
      const eventTime = input.event_time ? String(input.event_time).trim() : null;
      const notes = input.notes ? String(input.notes).trim() : null;

      const { data, error } = await admin
        .from("recurring_projects")
        .insert({
          user_id: userId,
          project_id: projectId,
          recurrence_type: recurrenceType,
          day_of_week: dayOfWeek,
          interval_days: intervalDays,
          day_of_month: dayOfMonth,
          manual_dates: manualDates ?? [],
          start_date: startDate,
          next_occurrence: nextOccurrence,
          event_time: eventTime,
          notes,
        })
        .select("id, project_id, recurrence_type, next_occurrence, event_time, notes")
        .single();

      if (error) return jsonResult({ error: error.message });

      // Sync to Google Calendar if connected
      if (data?.id) {
        const sync = await syncRecurringRuleToGoogle(data.id as string);
        if (!sync.ok) console.warn("[agent create_calendar_event] Google sync:", sync.error);
      }

      return jsonResult({ ok: true, rule: data });
    }

    case "delete_calendar_event": {
      const ruleId = String(input.rule_id ?? "").trim();
      if (!ruleId) return jsonResult({ error: "rule_id is required" });
      if (input.confirmed !== true) return jsonResult({ error: "confirmed must be true to delete a calendar event" });

      // Delete Google Calendar event first (non-fatal)
      try {
        await deleteGoogleEventForRule(ruleId, userId);
      } catch (e) {
        console.warn("[agent delete_calendar_event] Google delete:", e instanceof Error ? e.message : e);
      }

      const { error } = await admin
        .from("recurring_projects")
        .delete()
        .eq("id", ruleId)
        .eq("user_id", userId);

      if (error) return jsonResult({ error: error.message });
      return jsonResult({ ok: true, deleted_rule_id: ruleId });
    }

    // ── Proposals ─────────────────────────────────────────────────────────────

    case "generate_proposal": {
      const projectId = String(input.project_id ?? "").trim();
      if (!projectId) return jsonResult({ error: "project_id is required" });

      const mode = input.mode === "custom" ? "custom" : "strict";
      const customInstructions = input.custom_instructions ? String(input.custom_instructions).trim() : undefined;
      const scopeOverride = input.scope_override ? String(input.scope_override).trim() : undefined;
      const termsOverride = input.terms_override ? String(input.terms_override).trim() : undefined;
      const validUntilDays = typeof input.valid_until_days === "number" ? input.valid_until_days : 30;

      // Fetch project
      const { data: project, error: projErr } = await admin
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      if (projErr || !project) return jsonResult({ error: "Project not found" });

      // Fetch notes
      const { data: notes } = await admin
        .from("project_notes")
        .select("id, content, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(50);

      // Fetch media
      const { data: media } = await admin
        .from("project_media")
        .select("id, description, storage_path, media_type, created_at")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(30);

      // Build content blocks (interleaved by date)
      const contentBlocks: ContentBlock[] = [];
      for (const n of notes ?? []) {
        contentBlocks.push({ type: "note", content: n.content as string, createdAt: n.created_at as string, included: true });
      }
      for (const m of media ?? []) {
        if ((m.media_type as string) === "video") continue;
        const { data: urlData } = await admin.storage.from("project-media").createSignedUrl(m.storage_path as string, 3600);
        if (urlData?.signedUrl) {
          contentBlocks.push({
            type: "image",
            content: (m.description as string) ?? "",
            imageUrl: urlData.signedUrl,
            storagePath: m.storage_path as string,
            description: (m.description as string | null) ?? null,
            mediaId: m.id as string,
            mediaType: m.media_type as string,
            createdAt: m.created_at as string,
            included: true,
          });
        }
      }
      contentBlocks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Fetch invoices & line items for AI context
      const { data: invoices } = await admin
        .from("invoices")
        .select("id, invoice_number, total, status, notes, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(5);
      const invoiceIds = (invoices ?? []).map((inv) => inv.id).filter(Boolean);
      let lineItemsText = "No line item detail available.";
      if (invoiceIds.length > 0) {
        const { data: lineItems } = await admin
          .from("invoice_line_items")
          .select("description, quantity, unit_price, total")
          .in("invoice_id", invoiceIds)
          .limit(30);
        if (lineItems?.length) {
          lineItemsText = lineItems
            .map((li) => `  - ${li.description ?? "Item"}: qty=${li.quantity}, unit=$${li.unit_price}, total=$${li.total}`)
            .join("\n");
        }
      }

      // Fetch profile for design info
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, company_name, email, phone, invoice_primary_color, invoice_logo_url, invoice_title_font, invoice_body_font, invoice_footer")
        .eq("id", userId)
        .single();

      const today = new Date();
      const validUntilDate = new Date(today);
      validUntilDate.setDate(today.getDate() + validUntilDays);
      const validUntilStr = validUntilDate.toLocaleDateString("en-US");

      const proj = project as Record<string, unknown>;
      const notesText = notes?.length ? notes.map((n) => `- ${n.content}`).join("\n") : "(no notes recorded)";
      const invoicesText = invoices?.length
        ? invoices.map((inv) => `Invoice #${inv.invoice_number ?? "draft"}: total=$${inv.total}, status=${inv.status}${inv.notes ? `, notes: ${inv.notes}` : ""}`).join("\n")
        : "(no prior invoices for this project)";
      const mediaText = media?.length
        ? `${media.length} file(s): ${media.map((m) => (m.description as string | null) ?? (m.media_type as string) ?? "file").join(", ")}`
        : "(no media attached)";

      let modeBlock: string;
      if (mode === "strict") {
        modeBlock = `STRICT MODE — ABSOLUTE RULES:
1. Do NOT invent, guess, or estimate ANY line item, price, quantity, or description not explicitly present in the data above.
2. If no line items or prices are recorded, output an EMPTY lineItems array [].
3. Do NOT use typical contractor rates or external knowledge to fill in prices.
4. Use ONLY text from project notes and invoice line items to populate line items.
5. The scope paragraph must be based exclusively on the project description and notes.
6. If terms are not mentioned in the notes, output an empty string "" for terms.`;
      } else {
        modeBlock = `CUSTOM MODE — Use the following contractor-provided instructions to shape this document. Do NOT invent prices or line items not mentioned in the project data or custom instructions.

Custom instructions:
${customInstructions ?? "(none provided)"}`;
      }

      const prompt = `You are building a contractor quote document from REAL project data. Return ONLY valid JSON.

=== PROJECT DATA ===
Company: ${profile?.company_name ?? "Contractor"}
Contractor: ${profile?.full_name ?? ""}
Project name: ${proj.name ?? "Untitled"}
Client: ${proj.client_name ?? "Client"}
Description: ${proj.description ?? "(no description)"}
Location: ${[proj.city, proj.state].filter(Boolean).join(", ") || ((proj.location as string | null) ?? "(none)")}

Project notes:
${notesText}

Invoice line items:
${lineItemsText}

Invoice summaries:
${invoicesText}

Attached files: ${mediaText}

Today: ${today.toLocaleDateString("en-US")}
Valid until: ${validUntilStr}
${scopeOverride ? `\nContractor scope (use verbatim): ${scopeOverride}` : ""}
${termsOverride ? `\nContractor terms (use verbatim): ${termsOverride}` : ""}
=== END PROJECT DATA ===

${modeBlock}

Return ONLY valid JSON, no markdown:
{"title":"...","clientName":"...","scope":"...","lineItems":[{"description":"...","qty":1,"unitPrice":0}],"terms":"...","validUntil":"${validUntilStr}"}`;

      const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) return jsonResult({ error: "ANTHROPIC_API_KEY not set" });

      const anthropic = new Anthropic({ apiKey });
      const aiResponse = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const rawText = aiResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      let proposal: { title: string; clientName: string; scope: string; lineItems: ProposalLineItem[]; terms: string; validUntil: string };
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        proposal = JSON.parse(cleaned);
      } catch {
        return jsonResult({ error: "AI returned invalid JSON for proposal. Try again.", raw: rawText.slice(0, 200) });
      }

      // Apply overrides
      if (scopeOverride) proposal.scope = scopeOverride;
      if (termsOverride) proposal.terms = termsOverride;
      proposal.validUntil = validUntilStr;

      const profileData = profile as Record<string, unknown> | null;

      // Strip imageUrl before saving to DB
      const persistBlocks = contentBlocks.map((b) => ({ ...b, imageUrl: undefined }));

      const { data: saved, error: saveErr } = await admin
        .from("proposals")
        .insert({
          user_id: userId,
          project_id: projectId,
          title: proposal.title,
          client_name: proposal.clientName ?? null,
          scope: proposal.scope ?? null,
          terms: proposal.terms ?? null,
          valid_until: validUntilDate.toISOString().slice(0, 10),
          line_items: proposal.lineItems ?? [],
          content_blocks: persistBlocks,
          company_name: profile?.company_name ?? null,
          company_email: profile?.email ?? null,
          company_phone: profile?.phone ?? null,
          project_name: (proj.name as string) ?? null,
          design: {
            primaryColor: profileData?.invoice_primary_color ?? null,
            logoUrl: profileData?.invoice_logo_url ?? null,
            titleFont: profileData?.invoice_title_font ?? null,
            bodyFont: profileData?.invoice_body_font ?? null,
            footer: profileData?.invoice_footer ?? null,
          },
          status: "draft",
        })
        .select("id")
        .single();

      if (saveErr) return jsonResult({ error: saveErr.message });

      const total = (proposal.lineItems ?? []).reduce((s: number, i: ProposalLineItem) => s + i.qty * i.unitPrice, 0);
      return jsonResult({
        ok: true,
        proposal_id: saved.id,
        title: proposal.title,
        client_name: proposal.clientName,
        total,
        line_item_count: (proposal.lineItems ?? []).length,
        scope_preview: (proposal.scope ?? "").slice(0, 120),
        valid_until: validUntilStr,
      });
    }

    case "list_proposals": {
      const { data, error } = await admin
        .from("proposals")
        .select("id, title, client_name, project_name, status, valid_until, line_items, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) return jsonResult({ error: error.message });
      const proposals = (data ?? []).map((p) => {
        const items = (p.line_items ?? []) as ProposalLineItem[];
        const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
        return {
          id: p.id,
          title: p.title,
          client_name: p.client_name,
          project_name: p.project_name,
          status: p.status,
          valid_until: p.valid_until,
          total,
          line_item_count: items.length,
          created_at: p.created_at,
        };
      });
      return jsonResult({ ok: true, proposals, count: proposals.length });
    }

    case "get_proposal": {
      const proposalId = String(input.proposal_id ?? "").trim();
      if (!proposalId) return jsonResult({ error: "proposal_id is required" });

      const { data, error } = await admin
        .from("proposals")
        .select("*")
        .eq("id", proposalId)
        .eq("user_id", userId)
        .single();

      if (error || !data) return jsonResult({ error: "Proposal not found" });

      // Regenerate signed URLs for image blocks
      const blocks = (data.content_blocks ?? []) as ContentBlock[];
      for (const block of blocks) {
        if (block.type === "image" && block.storagePath) {
          const { data: urlData } = await admin.storage.from("project-media").createSignedUrl(block.storagePath, 3600);
          if (urlData?.signedUrl) block.imageUrl = urlData.signedUrl;
        }
      }

      const items = (data.line_items ?? []) as ProposalLineItem[];
      const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      return jsonResult({
        ok: true,
        id: data.id,
        title: data.title,
        client_name: data.client_name,
        project_name: data.project_name,
        scope: data.scope,
        terms: data.terms,
        valid_until: data.valid_until,
        status: data.status,
        line_items: items,
        total,
        content_block_count: blocks.length,
        share_token: data.share_token,
      });
    }

    default:
      return jsonResult({ error: `Unknown tool: ${name}` });
  }
}
