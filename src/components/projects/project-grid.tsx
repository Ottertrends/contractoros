import type { Project } from "@/lib/types/database";
import { ProjectCard } from "@/components/projects/project-card";

export function ProjectGrid({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}

