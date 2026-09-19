import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export function useElementWidth<Element extends HTMLElement>(): [
  React.RefObject<Element | null>,
  number,
] {
  const element = useRef<Element>(null);
  const [width, setWidth] = useState(0);
  // Measured before first paint so charts never flash in empty.
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    setWidth(Math.floor(node.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [element, width];
}

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

interface PointerPosition {
  clientX: number;
  clientY: number;
}

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const show = useCallback((pointer: PointerPosition, content: ReactNode) => {
    setTooltip({ x: pointer.clientX, y: pointer.clientY, content });
  }, []);
  const hide = useCallback(() => setTooltip(null), []);
  return { tooltip, show, hide };
}

const TOOLTIP_WIDTH = 240;
const TOOLTIP_OFFSET = 14;

export function Tooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null;
  const flips = tooltip.x + TOOLTIP_OFFSET + TOOLTIP_WIDTH > window.innerWidth;
  const left = flips
    ? Math.max(8, tooltip.x - TOOLTIP_OFFSET - TOOLTIP_WIDTH)
    : tooltip.x + TOOLTIP_OFFSET;
  const top = Math.min(tooltip.y + TOOLTIP_OFFSET, window.innerHeight - 180);
  return (
    <div
      className="tooltip"
      style={{ left, top, width: TOOLTIP_WIDTH }}
      role="status"
    >
      {tooltip.content}
    </div>
  );
}

export function TooltipTitle({
  children,
  detail,
}: {
  children: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="tooltip-title">
      <span>{children}</span>
      {detail && <span className="tooltip-detail">{detail}</span>}
    </div>
  );
}

export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="tooltip-row">
      <span
        className="tooltip-key"
        style={{ background: color ?? "transparent" }}
      />
      <span className="tooltip-value">{value}</span>
      <span className="tooltip-label">{label}</span>
    </div>
  );
}

interface LegendItem {
  label: string;
  color: string;
  mark?: "line" | "dot" | "band" | "bar";
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label} className="legend-item">
          <i
            className={`legend-mark legend-mark-${item.mark ?? "line"}`}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

interface AxisScale {
  (value: number): number;
}

interface GridProps {
  scale: AxisScale;
  ticks: number[];
  start: number;
  end: number;
  format?: (tick: number) => string;
  emphasized?: number;
}

export function HorizontalGrid({
  scale,
  ticks,
  start,
  end,
  format = String,
  emphasized,
}: GridProps) {
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick} transform={`translate(0, ${scale(tick)})`}>
          <line
            x1={start}
            x2={end}
            className={tick === emphasized ? "chart-baseline" : "chart-grid"}
          />
          <text
            x={start - 8}
            dy="0.32em"
            textAnchor="end"
            className="chart-tick"
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function BottomAxis({
  scale,
  ticks,
  start,
  format = String,
}: Omit<GridProps, "end" | "emphasized">) {
  return (
    <g transform={`translate(0, ${start})`}>
      {ticks.map((tick) => (
        <text
          key={tick}
          x={scale(tick)}
          y={18}
          textAnchor="middle"
          className="chart-tick"
        >
          {format(tick)}
        </text>
      ))}
    </g>
  );
}

export function AxisTitle({
  x,
  y,
  children,
  rotate = false,
}: {
  x: number;
  y: number;
  children: ReactNode;
  rotate?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="chart-axis-title"
      transform={rotate ? `rotate(-90, ${x}, ${y})` : undefined}
    >
      {children}
    </text>
  );
}
