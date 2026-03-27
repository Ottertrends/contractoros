import type { InvoiceStatus, Project } from "@/lib/types/database";
import { ProjectCard } from "@/components/projects/project-card";

export function ProjectGrid({
  projects,
  invoiceStatusMap = {},
  invoiceTotalMap = {},
}: {
  projects: Project[];
  invoiceStatusMap?: Record<string, InvoiceStatus>;
  invoiceTotalMap?: Record<string, string>;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          invoiceStatus={invoiceStatusMap[p.id]}
          invoiceTotal={invoiceTotalMap[p.id]}
        />
      ))}
    </div>
  );
}
