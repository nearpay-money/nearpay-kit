/**
 * Query strings in the API's notation: `expand[]=a&expand[]=b` → `{expand: ["a","b"]}`;
 * bracketed filters stay flat keys (`created[gte]=…` → `{"created[gte]": "…"}`, as in the spec's
 * query schemas); a plain key given twice becomes an array (and fails a scalar schema).
 */
export function parseQuery(search: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = Object.create(null);
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return out;
  for (const [rawKey, value] of new URLSearchParams(s)) {
    const isList = rawKey.endsWith("[]");
    const key = isList ? rawKey.slice(0, -2) : rawKey;
    if (!key || key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const prev = out[key];
    if (isList) out[key] = Array.isArray(prev) ? [...prev, value] : prev === undefined ? [value] : [prev, value];
    else out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return { ...out };
}
