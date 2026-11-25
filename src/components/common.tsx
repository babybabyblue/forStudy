import type { Importance } from "../subjects/types";

export function ImportanceChip({ value }: { value: Importance }) {
  return <span className={`chip imp imp-${value}`}>{value}</span>;
}

export function Bar({
  value,
  max,
  marker,
  label,
}: {
  value: number;
  max: number;
  marker?: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const mk = marker !== undefined && max > 0 ? Math.min(100, (marker / max) * 100) : undefined;
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
      {mk !== undefined && <div className="bar-marker" style={{ left: `${mk}%` }} title="計画ライン" />}
    </div>
  );
}

export function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
