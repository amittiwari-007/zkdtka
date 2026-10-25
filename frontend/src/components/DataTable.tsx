import type { ReactNode } from "react";

export interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  numeric?: boolean;
}

interface DataTableProps<Row> {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
}

/** The accessible, exact-values twin of every chart. */
export function DataTable<Row>({ caption, columns, rows, rowKey }: DataTableProps<Row>) {
  return (
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? "num" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.numeric ? "num" : undefined}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
