"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/client";
import type { Client, Project, ProjectStatus } from "@/lib/types/database";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  client_name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  current_work: z.string().optional().nullable(),
  quoted_amount: z.string().optional().nullable(),
  tagsText: z.string().optional().nullable(),
  status: z.enum(["active", "completed", "on_hold", "cancelled"]),
});

type FormValues = z.infer<typeof projectSchema>;

function normalizeNullable(value: string | null | undefined) {
  const v = value?.trim() ?? "";
  return v.length === 0 ? null : v;
}

function parseTags(tagsText: string | null | undefined): string[] | null {
  const raw = tagsText?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  return raw.length > 0 ? raw : null;
}

function computeLocation(city: string | null, state: string | null, locationField?: string | null) {
  const parts = [city ?? "", state ?? ""].map((s) => s.trim()).filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return locationField ?? null;
}

export function ProjectForm({
  mode,
  userId,
  project,
}: {
  mode: "create" | "edit";
  userId: string;
  project?: Project;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const tp = t.projects;

  // Client picker state
  const [clients, setClients] = React.useState<Client[]>([]);
  const [clientSearch, setClientSearch] = React.useState("");
  const [clientPickerOpen, setClientPickerOpen] = React.useState(false);

  React.useEffect(() => {
    supabase
      .from("clients")
      .select("*")
      .order("client_name")
      .then(({ data }: { data: Client[] | null }) => { if (data) setClients(data); });
  }, []);

  const filteredClients = React.useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const lower = clientSearch.toLowerCase();
    return clients.filter(
      (c) =>
        c.client_name.toLowerCase().includes(lower) ||
        (c.address ?? "").toLowerCase().includes(lower),
    );
  }, [clients, clientSearch]);

  const defaultValues: FormValues = {
    name: project?.name ?? "",
    client_name: project?.client_name ?? null,
    address: project?.address ?? null,
    city: project?.city ?? null,
    state: project?.state ?? null,
    zip: project?.zip ?? null,
    notes: project?.notes ?? null,
    current_work: project?.current_work ?? null,
    quoted_amount: project?.quoted_amount ?? null,
    tagsText: (project?.tags ?? []).join(", "),
    status: (project?.status ?? "active") as ProjectStatus,
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, isDirty },
  } = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(projectSchema),
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const statusValue = watch("status");

  async function onSubmit(values: FormValues) {
    try {
      const tags = parseTags(values.tagsText);
      const city = normalizeNullable(values.city);
      const state = normalizeNullable(values.state);
      const quoted_amount = normalizeNullable(values.quoted_amount);

      const payload = {
        name: values.name.trim(),
        client_name: normalizeNullable(values.client_name),
        address: normalizeNullable(values.address),
        city,
        state,
        zip: normalizeNullable(values.zip),
        location: computeLocation(city, state, project?.location ?? null),
        notes: normalizeNullable(values.notes),
        current_work: normalizeNullable(values.current_work),
        quoted_amount,
        tags,
        status: values.status,
      };

      if (mode === "create") {
        const { data, error } = await supabase
          .from("projects")
          .insert({ user_id: userId, ...payload })
          .select("id")
          .single();

        if (error) throw error;
        toast.success("Project created");
        router.push(`/dashboard/projects/${data.id}`);
      } else {
        if (!project?.id) return;
        const { error } = await supabase
          .from("projects")
          .update(payload)
          .eq("id", project.id);

        if (error) throw error;
        toast.success("Project saved");
        router.refresh();
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to save project";
      toast.error(message);
    }
  }

  async function onDelete() {
    try {
      if (!project?.id) return;
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);

      if (error) throw error;
      toast.success("Project deleted");
      router.push("/dashboard/projects");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete project";
      toast.error(message);
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "create" ? tp.createProject : tp.editProject}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{tp.projectName}</Label>
              <Input id="name" {...register("name")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">{t.dashboard.status}</Label>
              <Select
                value={statusValue}
                onValueChange={(v) =>
                  setValue("status", v as ProjectStatus, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{tp.active}</SelectItem>
                  <SelectItem value="on_hold">{tp.onHold}</SelectItem>
                  <SelectItem value="completed">{tp.completed}</SelectItem>
                  <SelectItem value="cancelled">{tp.cancelled}</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" {...register("status")} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="client_name">{tp.clientName}</Label>
              {clients.length > 0 && (
                <button
                  type="button"
                  onClick={() => setClientPickerOpen((o) => !o)}
                  className="text-xs text-primary hover:underline"
                >
                  {clientPickerOpen ? "Close" : "Select saved client →"}
                </button>
              )}
            </div>

            {clientPickerOpen && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <input
                    autoFocus
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients…"
                    className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredClients.length === 0 ? (
                    <div className="p-3 text-sm text-slate-400 text-center">No clients found</div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setValue("client_name", c.client_name, { shouldDirty: true });
                          if (c.address) setValue("address", c.address, { shouldDirty: true });
                          setClientPickerOpen(false);
                          setClientSearch("");
                        }}
                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-900 border-b border-slate-50 dark:border-slate-800 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-50">
                            {c.client_name}
                          </div>
                          {c.address && (
                            <div className="text-xs text-slate-400 truncate">{c.address}</div>
                          )}
                        </div>
                        {c.phone && (
                          <div className="ml-auto shrink-0 text-xs text-slate-400">{c.phone}</div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <Input id="client_name" {...register("client_name")} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="address">{tp.address}</Label>
              <Input id="address" {...register("address")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="zip">{tp.zip}</Label>
              <Input id="zip" {...register("zip")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="city">{tp.city}</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="state">{tp.state}</Label>
              <Input id="state" {...register("state")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quoted_amount">{tp.quotedAmount}</Label>
              <Input id="quoted_amount" {...register("quoted_amount")} placeholder="e.g. 25000" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tagsText">Tags (,)</Label>
              <Input id="tagsText" {...register("tagsText")} placeholder="e.g. concrete, remodel" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current_work">{tp.currentWork}</Label>
            <Textarea id="current_work" {...register("current_work")} />
            <p className="text-xs text-slate-400">Private — not shown on invoices.</p>
          </div>


          <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
            {mode === "edit" ? (
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="danger" onClick={() => setConfirmOpen(true)}>
                    {tp.deleteProject}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{tp.deleteConfirmTitle}</DialogTitle>
                    <DialogDescription>
                      {tp.deleteConfirmDesc}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
                      {tp.cancel}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => void onDelete()}>
                      {tp.delete}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting || (!isDirty && mode === "create")}>
                {isSubmitting ? tp.saving : tp.saveProject}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
