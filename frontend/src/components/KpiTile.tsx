import type { ReactNode } from "react";

interface KpiTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: "bad";
}

export function KpiTile({ label, value, sub, subTone }: KpiTileProps) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className={`kpi-sub${subTone === "bad" ? " delta-bad" : ""}`}>{sub}</span>}
    </div>
  );
}
