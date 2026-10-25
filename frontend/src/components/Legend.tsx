export type KeyKind = "line" | "dashed" | "area" | "bar" | "dot";

export interface LegendItem {
  label: string;
  color: string;
  kind: KeyKind;
}

export function LegendKey({ color, kind }: { color: string; kind: KeyKind }) {
  const style = kind === "dashed" ? { borderTopColor: color } : { background: color };
  return <span className={`legend-key ${kind}`} style={style} aria-hidden="true" />;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label} className="legend-item">
          <LegendKey color={item.color} kind={item.kind} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
