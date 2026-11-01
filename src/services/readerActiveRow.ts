/** Keep selection stable while rows near the probe are being remeasured. */
export function readerActiveRow(rows: { index: number; start: number; end: number }[], ids: string[], current: string | null,
  scrollTop: number, viewportHeight: number): string | null {
  const probe = scrollTop + Math.min(100, viewportHeight / 4);
  const active = rows.find(row => ids[row.index] === current);
  if (active && probe >= active.start - 24 && probe < active.end + 24) return current;
  const row = rows.find(row => row.end > probe && !!ids[row.index]);
  return row ? ids[row.index] : null;
}
