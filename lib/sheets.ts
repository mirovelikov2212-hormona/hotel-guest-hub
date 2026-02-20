// src/lib/sheets.ts
type CsvRow = Record<string, string>;

function parseCSV(text: string): string[][] {
  // Simple CSV parser (handles quotes). Good enough for Google "output=csv".
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (ch === ",")) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n")) {
      row.push(cell);
      cell = "";
      // trim possible \r
      row = row.map((x) => x.replace(/\r$/, ""));
      // ignore empty last line
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  // last line
  if (cell.length || row.length) {
    row.push(cell);
    row = row.map((x) => x.replace(/\r$/, ""));
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }

  return rows;
}

export async function fetchSheetRows(url: string, opts?: { noStore?: boolean }): Promise<CsvRow[]> {
  if (!url) return [];
  const res = await fetch(url, {
    // dev: no-store; prod: can be cached if you want
    cache: opts?.noStore ? "no-store" : "force-cache",
    // If you want periodic refresh in prod:
    // next: { revalidate: 60 },
  });

  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const table = parseCSV(text);
  if (!table.length) return [];

  const headers = table[0].map((h) => h.trim());
  return table.slice(1).map((cells) => {
    const obj: CsvRow = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
}

// Helpers for our 3 tabs:

export async function loadConfigKV(url: string): Promise<Record<string, string>> {
  // Expected headers: key,value
  const rows = await fetchSheetRows(url, { noStore: true });
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key || r.Key || r.KEY;
    const v = r.value || r.Value || r.VALUE;
    if (k) out[String(k).trim()] = String(v ?? "").trim();
  }
  return out;
}

export async function loadI18N(url: string): Promise<Record<string, Record<string, string>>> {
  // Expected headers: lang,key,value
  const rows = await fetchSheetRows(url, { noStore: true });
  const out: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    const lang = (r.lang || r.language || r.LANG || "").trim();
    const key = (r.key || r.KEY || "").trim();
    const value = (r.value || r.VALUE || "").trim();
    if (!lang || !key) continue;
    out[lang] ||= {};
    out[lang][key] = value;
  }
  return out;
}

export async function loadMenus(url: string): Promise<any[]> {
  // Keep generic for now. Expected headers can be whatever you defined.
  // We'll just return rows and wire them later into UI/AI when you say how MENUS is structured.
  return await fetchSheetRows(url, { noStore: true });
}
