const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function allowWebhookEvent(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { count: 0, windowStart: now };
  if (now - b.windowStart > WINDOW_MS) {
    b.count = 0;
    b.windowStart = now;
  }
  b.count += 1;
  buckets.set(key, b);
  return b.count <= MAX_PER_WINDOW;
}
