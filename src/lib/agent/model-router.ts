import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_ANTHROPIC_MODEL, HAIKU_MODEL } from "./model";

/**
 * Heuristic patterns → SIMPLE turn → Haiku 4.5
 * These cover the most common contractor actions: listing, saving, status updates.
 */
const SIMPLE_PATTERNS: RegExp[] = [
  // Listing requests (ES + EN)
  /^(lista|listar|muéstrame|ver|show|list|dame\s+mis?|muestra)\s+(mis?\s+)?(proyectos?|clientes?|facturas?|invoices?|precios?|propuestas?|horarios?|schedules?|eventos?|calendar)/i,
  // Find/search a specific client or project by name
  /^(busca|encuentra|find|search)\s+(el\s+|la\s+|un\s+|una\s+)?(cliente|client|proyecto|project)\b/i,
  // Status/payment updates
  /\b(marcar|marca|mark|set|cambiar\s+estado|update\s+status)\b.{0,40}(pagad|paid|sent|enviado|void|open)/i,
  // Save a client
  /^(guardar|save|agregar|añadir|add)\s+(cliente|client|al\s+directorio)/i,
  // Add to price book
  /\b(agregar|añadir|add).{0,20}(price\s*book|libro\s+de\s+precios)/i,
  // View calendar / schedule
  /^(qué\s+tengo|what.*schedule|mis?\s+event|ver\s+calendario|show.*calendar|my\s+schedule)/i,
  // Simple greetings / status checks (bot handles these instantly)
  /^(hola|hi|hello|hey|buenos?\s+(días?|tardes?|noches?))[.!?]?\s*$/i,
];

/**
 * Heuristic patterns → COMPLEX turn → Sonnet 4.6
 * Checked before SIMPLE so complex intent always wins.
 */
const COMPLEX_PATTERNS: RegExp[] = [
  // Proposals
  /\b(propuesta|proposal|genera\s+propuesta|generate\s+proposal|crea\s+(una\s+)?propuesta)\b/i,
  // Web / internet search for prices
  /\b(busca[r]?\s+(precio|en\s+internet|en\s+línea)|search.*(price|cost|rate)|cuánto\s+cuesta|how\s+much\s+(does|is|cost))\b/i,
  // Create project
  /\b(crear?\s+(un\s+)?proyecto|create\s+(a\s+)?project|nuevo\s+proyecto|new\s+project)\b/i,
  // Create / generate invoice
  /\b(crear?\s+(una\s+)?factura|create\s+(an?\s+)?invoice|genera\s+(una\s+)?factura|hacer\s+(una\s+)?factura)\b/i,
  // Delete project
  /\b(eliminar\s+proyecto|delete\s+project|borrar\s+proyecto|remove\s+project)\b/i,
  // Create calendar / recurring event
  /\b(crear?\s+(un\s+)?(horario|calendario|evento\s+recurrente)|create\s+(a\s+)?(calendar|schedule|recurring))\b/i,
  // Multi-instruction messages (contains "and" or "y" between two actions)
  /\b(y\s+también|and\s+also|y\s+además|and\s+then)\b/i,
];

/**
 * Route a user message to the appropriate model tier.
 *
 * Priority order:
 * 1. Message > 300 chars → always Sonnet (likely complex)
 * 2. COMPLEX heuristic match → Sonnet
 * 3. SIMPLE heuristic match → Haiku
 * 4. No match → Haiku classification call (cheap fallback), default Sonnet on error
 */
export async function routeToModel(
  userMessage: string,
  client: Anthropic,
): Promise<{ model: string; method: "heuristic-complex" | "heuristic-simple" | "classifier" | "length" | "fallback" }> {
  const msg = userMessage.trim();

  // 1. Long messages are almost always complex
  if (msg.length > 300) {
    return { model: DEFAULT_ANTHROPIC_MODEL, method: "length" };
  }

  // 2. Complex patterns take priority
  if (COMPLEX_PATTERNS.some((p) => p.test(msg))) {
    return { model: DEFAULT_ANTHROPIC_MODEL, method: "heuristic-complex" };
  }

  // 3. Simple patterns
  if (SIMPLE_PATTERNS.some((p) => p.test(msg))) {
    return { model: HAIKU_MODEL, method: "heuristic-simple" };
  }

  // 4. Haiku classifier fallback
  try {
    const classification = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: `You are classifying a message sent to a contractor business assistant.
Reply with exactly one word: "simple" or "complex".

simple = listing data, viewing projects/clients/invoices, saving a client, changing invoice status
complex = creating projects, creating/generating invoices, generating proposals, searching the web, deleting projects, scheduling recurring events, multi-step tasks

Message: "${msg.slice(0, 200)}"`,
        },
      ],
    });
    const text =
      classification.content[0]?.type === "text"
        ? classification.content[0].text.trim().toLowerCase()
        : "";
    const model = text === "simple" ? HAIKU_MODEL : DEFAULT_ANTHROPIC_MODEL;
    return { model, method: "classifier" };
  } catch (err) {
    console.warn("[model-router] classifier failed, defaulting to Sonnet:", err instanceof Error ? err.message : err);
    return { model: DEFAULT_ANTHROPIC_MODEL, method: "fallback" };
  }
}
