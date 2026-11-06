export function toCSV<T extends Record<string, unknown>>(rows: T[], headers?: { key: keyof T; label: string }[]): string {
  if (rows.length === 0) return "";
  const cols = headers ?? (Object.keys(rows[0]) as (keyof T)[]).map((k) => ({ key: k, label: String(k) }));
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => escape(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c.key])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
