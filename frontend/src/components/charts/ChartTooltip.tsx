import type { ReactNode } from "react";

import { LegendKey, type KeyKind } from "../Legend";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  kind?: KeyKind;
}

/** Values lead, labels follow; series keyed with a short line, not a box. */
export function TooltipCard({
  title,
  rows,
  note,
}: {
  title: ReactNode;
  rows: TooltipRow[];
  note?: ReactNode;
}) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="chart-tooltip-row">
          {row.color && <LegendKey color={row.color} kind={row.kind ?? "line"} />}
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </div>
      ))}
      {note && <div className="chart-tooltip-note">{note}</div>}
    </div>
  );
}
