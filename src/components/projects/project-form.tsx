"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import type { Project, ProjectStatus } from "@/lib/types/database";

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
  // Prefer structured city/state; fall back to existing location if present.
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
        quoted_amount: quoted_amount,
        tags,
        status: values.status,
      };

      if (mode === "create") {
        const { data, error } = await supabase
          .from("projects")
          .insert({
            user_id: userId,
            ...payload,
          })
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
        // Refresh data (server components) after save.
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
          {mode === "create" ? "New Project" : "Edit Project"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Project name *</Label>
              <Input id="name" {...register("name")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
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
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" {...register("status")} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client_name">Client name</Label>
            <Input id="client_name" {...register("client_name")} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="zip">Zip</Label>
              <Input id="zip" {...register("zip")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" {...register("state")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quoted_amount">Quoted amount</Label>
              <Input id="quoted_amount" {...register("quoted_amount")} placeholder="e.g. 25000" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tagsText">Tags (comma separated)</Label>
              <Input id="tagsText" {...register("tagsText")} placeholder="e.g. concrete, remodel" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="current_work">Current work</Label>
            <Textarea id="current_work" {...register("current_work")} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} />
          </div>

          <div className="flex items-center justify-between gap-4 pt-2 flex-wrap">
            {mode === "edit" ? (
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="danger" onClick={() => setConfirmOpen(true)}>
                    Delete project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete this project?</DialogTitle>
                    <DialogDescription>
                      This will permanently remove the project and related records.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="danger" onClick={() => void onDelete()}>
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting || (!isDirty && mode === "create")}>
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

