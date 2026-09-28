// 1. Data ingestion — parse a CSV into raw string rows, dropping blank or empty columns.
import Papa from "papaparse";
import type { RawDataset } from "../types";

export function parseCsv(text: string, name: string): RawDataset {
  const warnings: string[] = [];
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  if (res.errors.length) {
    for (const e of res.errors.slice(0, 5)) warnings.push(`Row ${(e.row ?? 0) + 1}: ${e.message}`);
  }
  const grid = res.data as string[][];
  if (!grid.length) throw new Error("The file is empty.");
  const header = grid[0].map((h) => (h ?? "").trim());
  const body = grid.slice(1);

  // Deduplicate header names so no column is silently overwritten.
  const seen = new Map<string, number>();
  const names = header.map((h, i) => {
    const base = h || `__blank_${i}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });

  const keep: number[] = [];
  const dropped: string[] = [];
  names.forEach((n, i) => {
    const blankHeader = n.startsWith("__blank_");
    const allEmpty = body.every((r) => !(r[i] ?? "").trim());
    if (blankHeader && allEmpty) return; // trailing ",,,," padding — ignore silently
    if (blankHeader || allEmpty) { dropped.push(blankHeader ? `(unnamed column ${i + 1})` : n); return; }
    keep.push(i);
  });

  const rows = body
    .filter((r) => r.some((c) => (c ?? "").trim()))
    .map((r) => {
      const o: Record<string, string> = {};
      for (const i of keep) o[names[i]] = (r[i] ?? "").trim();
      return o;
    });

  return { name, columns: keep.map((i) => names[i]), rows, droppedColumns: dropped, parseWarnings: warnings };
}
