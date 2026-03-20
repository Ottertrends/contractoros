/**
 * Compare two WhatsApp JIDs / phone digit strings loosely.
 * Handles missing country codes (e.g. national vs E.164) and minor formatting differences.
 */
export function whatsappDigitsLooselyEqual(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;

  const tail = (s: string, n: number) =>
    s.slice(-Math.min(Math.max(n, 1), s.length));

  // Try matching on last 9–12 digits (typical national + mobile lengths)
  for (const n of [12, 11, 10, 9]) {
    const ta = tail(da, n);
    const tb = tail(db, n);
    if (ta.length >= 9 && tb.length >= 9 && ta === tb) return true;
  }

  return da.endsWith(db) || db.endsWith(da);
}
