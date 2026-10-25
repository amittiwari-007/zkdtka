import { useId, useState, type ReactNode } from "react";

import { DataTable, type Column } from "./DataTable";
import { Legend, type LegendItem } from "./Legend";

interface ChartCardProps<Row> {
  title: string;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  actions?: ReactNode;
  footnote?: ReactNode;
  table: { caption: string; columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string };
  children: ReactNode;
}

/** A chart with its title, legend and a table-view toggle (the accessible twin of the chart). */
export function ChartCard<Row>({
  title,
  subtitle,
  legend,
  actions,
  footnote,
  table,
  children,
}: ChartCardProps<Row>) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="chart-card-header">
        <div>
          <h3 id={headingId}>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="chart-card-actions">
          {!showTable && actions}
          <button
            type="button"
            className="toggle"
            aria-pressed={showTable}
            onClick={() => setShowTable((value) => !value)}
          >
            Table view
          </button>
        </div>
      </div>
      {showTable ? (
        <DataTable {...table} />
      ) : (
        <>
          {legend && <Legend items={legend} />}
          <div className="chart-body">{children}</div>
        </>
      )}
      {footnote && <p className="chart-footnote">{footnote}</p>}
    </section>
  );
}
