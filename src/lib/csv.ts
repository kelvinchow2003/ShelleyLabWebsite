// Minimal CSV export helpers — no dependencies.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from an array of objects, using the given ordered columns. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Convenience: build + download in one call. */
export function exportCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: { key: keyof T; label: string }[]
): void {
  downloadCsv(filename, toCsv(rows, columns));
}

/** Date stamp for filenames, e.g. 2026-06-30. */
export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
