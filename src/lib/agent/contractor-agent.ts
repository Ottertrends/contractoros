import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import { executeTool } from "@/lib/agent/tool-handlers";
import { SYSTEM_PROMPT } from "@/lib/agent/types";
import { CONTRACTOR_TOOLS } from "@/lib/agent/tools";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function getModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

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
): Promise<string> {
  const fallback =
    "Sorry, I'm having trouble processing that. Please try again in a moment.";

  try {
    const client = getClient();
    let messages = buildMessageParams(history, messageText);
    const maxLoops = 8;

    for (let i = 0; i < maxLoops; i++) {
      const response = await client.messages.create({
        model: getModel(),
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: CONTRACTOR_TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const text = extractTextFromResponse(response.content);
        return text || "✅ Done.";
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
                const result = await executeTool(userId, tu.name, input);
                return {
                  type: "tool_result" as const,
                  tool_use_id: tu.id,
                  content: result,
                };
              }),
            ),
          },
        ];
        continue;
      }

      const text = extractTextFromResponse(response.content);
      if (text) return text;
      return fallback;
    }

    return fallback;
  } catch (e) {
    console.error("contractor-agent error:", e);
    return fallback;
  }
}
