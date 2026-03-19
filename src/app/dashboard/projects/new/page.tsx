import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/projects/project-form";

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <ProjectForm mode="create" userId={user.id} />
    </div>
  );
}

