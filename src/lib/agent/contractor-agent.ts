import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeTool } from "@/lib/agent/tool-handlers";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/agent/model";
import { SYSTEM_PROMPT } from "@/lib/agent/types";
import { CONTRACTOR_TOOLS } from "@/lib/agent/tools";

function getModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

function formatAgentError(e: unknown): string {
  if (e instanceof Error) {
    const any = e as Error & {
      status?: number;
      body?: unknown;
      error?: { message?: string; type?: string };
    };
    const parts: string[] = [any.message || "Error"];
    if (typeof any.status === "number") parts.push(`http=${any.status}`);
    if (any.error?.message) parts.push(`api=${any.error.message}`);
    if (any.body !== undefined) {
      try {
        parts.push(`body=${JSON.stringify(any.body).slice(0, 400)}`);
      } catch {
        parts.push("body=(unserializable)");
      }
    }
    return parts.join(" | ");
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export type AgentRunResult = {
  reply: string;
  /** Set when Claude/API/tools failed; `reply` may still be a safe fallback string */
  error?: string;
};

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: key });
}

function buildMessageParams(
  history: { role: "user" | "assistant"; content: string }[],
  latestUserText: string,
): MessageParam[] {
  const recent = history.slice(-20);
  const msgs: MessageParam[] = recent.map((h) => ({
    role: h.role,
    content: h.content,
  }));
  msgs.push({ role: "user", content: latestUserText });
  return msgs;
}

function extractTextFromResponse(content: ContentBlock[]): string {
  const parts = content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text);
  return parts.join("\n").trim();
}

/**
 * Run Claude with tools; returns assistant text to send on WhatsApp.
 */
export async function processContractorMessage(
  userId: string,
  messageText: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<AgentRunResult> {
  const fallback =
    "Sorry, I'm having trouble processing that. Please try again in a moment.";

  try {
    const model = getModel();
    console.log(
      "[contractor-agent] start",
      { model, userId: userId.slice(0, 8), historyLen: history.length },
    );
    const client = getClient();

    // Fetch this contractor's long-term memory and inject it into the prompt
    const admin = createSupabaseAdminClient();
    const { data: memRow } = await admin
      .from("agent_memory")
      .select("memory_text, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    const memoryBlock = memRow?.memory_text?.trim()
      ? `\n\n━━━ YOUR MEMORY ABOUT THIS CONTRACTOR ━━━\n${memRow.memory_text}\n(Last updated: ${memRow.updated_at ? new Date(memRow.updated_at).toLocaleDateString() : "unknown"})\nWhen you learn new important details, call update_memory with the full updated memory block.`
      : `\n\n━━━ CONTRACTOR MEMORY ━━━\n(No notes yet — memory is empty. As you learn about this contractor's services, pricing, clients, and work style, call update_memory to start building their profile.)`;

    const systemWithMemory = SYSTEM_PROMPT + memoryBlock;

    let messages = buildMessageParams(history, messageText);
    const maxLoops = 8;

    for (let i = 0; i < maxLoops; i++) {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemWithMemory,
        tools: CONTRACTOR_TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const text = extractTextFromResponse(response.content);
        return { reply: text || "✅ Done." };
      }

      if (response.stop_reason === "tool_use") {
        const toolUses = response.content.filter(
          (b): b is ToolUseBlock => b.type === "tool_use",
        );

        messages = [
          ...messages,
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: await Promise.all(
              toolUses.map(async (tu) => {
                const input =
                  typeof tu.input === "object" && tu.input !== null
                    ? (tu.input as Record<string, unknown>)
                    : {};
                try {
                  const result = await executeTool(userId, tu.name, input);
                  return {
                    type: "tool_result" as const,
                    tool_use_id: tu.id,
                    content: result,
                  };
                } catch (toolErr) {
                  const msg = formatAgentError(toolErr);
                  console.error(
                    "[contractor-agent] tool error",
                    tu.name,
                    msg,
                  );
                  return {
                    type: "tool_result" as const,
                    tool_use_id: tu.id,
                    content: `Tool error: ${msg}`,
                  };
                }
              }),
            ),
          },
        ];
        continue;
      }

      const text = extractTextFromResponse(response.content);
      if (text) return { reply: text };
      return {
        reply: fallback,
        error: `Unexpected stop_reason=${response.stop_reason}`,
      };
    }

    return {
      reply: fallback,
      error: "Exceeded max tool loops",
    };
  } catch (e) {
    const detail = formatAgentError(e);
    console.error("[contractor-agent] error:", detail, e);
    return { reply: fallback, error: detail };
  }
}
