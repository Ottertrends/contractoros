/**
 * Default Claude model when `ANTHROPIC_MODEL` is not set.
 * Sonnet 4.x alias used by current Anthropic APIs; override in Vercel if needed.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

/**
 * Haiku 4.5 — used for simple CRUD turns (listing, status updates, saves).
 * ~4x cheaper than Sonnet; same tool format.
 */
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
