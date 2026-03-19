import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MessageListClient } from "@/components/messages/message-list";
import type { MessageLog, Project } from "@/lib/types/database";

type Row = MessageLog & {
  projects?: { id: string; name: string } | null;
};

export default async function MessagesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const msgs = (rawMessages ?? []) as MessageLog[];
  const projectIds = [
    ...new Set(
      msgs.map((m) => m.project_id).filter((id): id is string => !!id),
    ),
  ];

  let projectMap = new Map<string, { id: string; name: string }>();
  if (projectIds.length > 0) {
    const { data: projs } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    for (const p of projs ?? []) {
      projectMap.set(p.id, p);
    }
  }

  const initialMessages: Row[] = [...msgs]
    .reverse()
    .map((m) => ({
      ...m,
      projects: m.project_id ? projectMap.get(m.project_id) ?? null : null,
    }));

  const { data: projectList } = await supabase
    .from("projects")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const projects = (projectList ?? []) as Pick<Project, "id" | "name">[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">
          WhatsApp conversation history with WorkSup.
        </p>
      </div>
      <MessageListClient
        userId={user.id}
        initialMessages={initialMessages}
        projects={projects}
      />
    </div>
  );
}
