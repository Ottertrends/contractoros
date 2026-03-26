"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Client } from "@/lib/types/database";

interface Props {
  initialClients: Client[];
}

const EMPTY = {
  client_name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
  notes: "",
};

type EditingRow = typeof EMPTY & { id: string | null };

const inputCls =
  "flex h-8 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function ClientsClient({ initialClients }: Props) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<EditingRow>({ id: null, ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.client_name.toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.state ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
    );
  }, [clients, search]);

  function startNew() {
    setEditingId("new");
    setForm({ id: null, ...EMPTY });
    setError(null);
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setForm({
      id: c.id,
      client_name: c.client_name,
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      zip: c.zip ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleSave() {
    if (!form.client_name.trim()) { setError("Client name is required."); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        client_name: form.client_name.trim(),
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId === "new") {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        setClients((prev) => [created, ...prev]);
      } else {
        const res = await fetch(`/api/clients/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        setClients((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      }
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/clients/${id}`, { method: "DELETE" });
      setClients((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  function fullAddress(c: Client) {
    const parts = [c.address, c.city, c.state ? `${c.state}${c.zip ? " " + c.zip : ""}` : c.zip].filter(Boolean);
    return parts.join(", ");
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">Clients</div>
          <div className="text-sm text-slate-500">
            Save client details to quickly fill new projects.
          </div>
        </div>
        {editingId === null && (
          <Button onClick={startNew} size="sm">+ Add Client</Button>
        )}
      </div>

      {/* Inline add/edit form */}
      {editingId !== null && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              {editingId === "new" ? "New Client" : "Edit Client"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={form.client_name}
                  onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                  placeholder="e.g. John Smith, ABC Corp"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Street Address</label>
                <input
                  className={inputCls}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">City</label>
                <input
                  className={inputCls}
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Austin"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">State</label>
                  <input
                    className={inputCls}
                    value={form.state}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                    placeholder="TX"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">ZIP</label>
                  <input
                    className={inputCls}
                    value={form.zip}
                    onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                    placeholder="78701"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Phone</label>
                <input
                  className={inputCls}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
                <input
                  className={inputCls}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="client@example.com"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Notes</label>
                <input
                  className={inputCls}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional notes"
                />
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editingId === "new" ? "Add Client" : "Save Changes"}
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search clients…"
        className="flex h-9 w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      <div className="text-xs text-slate-400">
        {filtered.length} client{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </div>

      {/* Excel-style table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-4 py-3 min-w-[150px]">Client Name</th>
                  <th className="px-4 py-3 min-w-[160px]">Address</th>
                  <th className="px-4 py-3 min-w-[100px]">City</th>
                  <th className="px-4 py-3 w-16">State</th>
                  <th className="px-4 py-3 w-20">ZIP</th>
                  <th className="px-4 py-3 min-w-[120px]">Phone</th>
                  <th className="px-4 py-3 min-w-[160px]">Email</th>
                  <th className="px-4 py-3 min-w-[140px]">Notes</th>
                  <th className="px-4 py-3 w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                      {clients.length === 0
                        ? "No clients yet. Add your first client above."
                        : "No clients match your search."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-900/60 transition-colors group"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-50">
                        {c.client_name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px]">
                        <span className="truncate block">{c.address ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{c.city ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{c.state ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.zip ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="hover:text-primary hover:underline">
                            {c.email}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[140px]">
                        <span className="truncate block">{c.notes ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {confirmDeleteId === c.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-slate-400">Delete?</span>
                            <button
                              onClick={() => void handleDelete(c.id)}
                              disabled={deletingId === c.id}
                              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                            >
                              {deletingId === c.id ? "…" : "Yes"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-slate-400 hover:underline"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(c)}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(c.id)}
                              className="text-xs font-medium text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* helper: fullAddress not shown in table but used elsewhere */}
      {false && filtered.map((c) => fullAddress(c))}
    </div>
  );
}
