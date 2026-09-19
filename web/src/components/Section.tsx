import { useState, type ReactNode } from "react";

export interface TableColumn {
  label: string;
  align?: "left" | "right";
}

export interface TableData {
  columns: TableColumn[];
  rows: (string | number)[][];
}

export function DataTable({ columns, rows }: TableData) {
  return (
    <div className="scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                className={column.align === "left" ? undefined : "is-number"}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowPosition) => (
            <tr key={rowPosition}>
              {row.map((cell, cellPosition) => (
                <td
                  key={cellPosition}
                  className={
                    columns[cellPosition].align === "left"
                      ? undefined
                      : "is-number"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SectionProps {
  title: string;
  finding: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  table?: TableData;
  // "rail" sets the finding beside the figure; "lead" gives the finding headline scale above it.
  layout?: "rail" | "stack" | "lead";
  children: ReactNode;
}

export function Section({
  title,
  finding,
  note,
  aside,
  table,
  layout = "rail",
  children,
}: SectionProps) {
  const [showsTable, setShowsTable] = useState(false);
  const tableToggle = table && (
    <button
      type="button"
      className="text-button"
      aria-expanded={showsTable}
      onClick={() => setShowsTable(!showsTable)}
    >
      {showsTable ? "Hide the numbers" : "See the numbers"}
    </button>
  );

  return (
    <section className={`section section-${layout}`}>
      <div className="section-text">
        <h2 className="section-title">{title}</h2>
        <p className="finding">{finding}</p>
        {(note || aside || tableToggle) && (
          <div className="section-support">
            {note && <p className="note">{note}</p>}
            {aside}
            {tableToggle}
          </div>
        )}
      </div>
      <div className="section-figure">
        {children}
        {table && showsTable && (
          <div className="section-numbers">
            <DataTable {...table} />
          </div>
        )}
      </div>
    </section>
  );
}
