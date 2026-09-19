import type { CSSProperties } from "react";
import { formatNumber } from "../format";

interface RangeBarProps {
  floor: number;
  ceiling: number;
  projection: number;
  actual?: number;
  maximum: number;
  size?: "row" | "feature";
}

const TICK_SPACING = 20;

function position(value: number, maximum: number): string {
  return `${Math.min(100, Math.max(0, (100 * value) / maximum))}%`;
}

// Faint vertical gridlines every 20 fantasy points, shared by every bar on the same scale.
function gridStyle(maximum: number): CSSProperties {
  return { "--tick": `${(100 * TICK_SPACING) / maximum}%` } as CSSProperties;
}

export function RangeBar({
  floor,
  ceiling,
  projection,
  actual,
  maximum,
  size = "row",
}: RangeBarProps) {
  const description =
    `Projected ${formatNumber(projection)} fantasy points, likely range ${formatNumber(Math.max(0, floor))} to ` +
    `${formatNumber(ceiling)}` +
    (actual === undefined ? "" : `, actual ${formatNumber(actual)}`);

  return (
    <div
      className={`range-bar range-bar-${size}`}
      role="img"
      aria-label={description}
      style={gridStyle(maximum)}
    >
      <div
        className="range-bar-band"
        style={{
          left: position(floor, maximum),
          right: `calc(100% - ${position(ceiling, maximum)})`,
        }}
      />
      <div
        className="range-bar-projection"
        style={{ left: position(projection, maximum) }}
      />
      {actual !== undefined && (
        <div
          className="range-bar-actual"
          style={{ left: position(actual, maximum) }}
        />
      )}
    </div>
  );
}

interface DumbbellProps {
  projection: number;
  actual: number;
  maximum: number;
}

export function Dumbbell({ projection, actual, maximum }: DumbbellProps) {
  const low = Math.min(projection, actual);
  const high = Math.max(projection, actual);
  return (
    <div
      className="range-bar range-bar-row"
      role="img"
      aria-label={`Average projection ${formatNumber(projection)}, average actual ${formatNumber(actual)}`}
      style={gridStyle(maximum)}
    >
      <div
        className="range-bar-link"
        style={{
          left: position(low, maximum),
          right: `calc(100% - ${position(high, maximum)})`,
        }}
      />
      <div
        className="range-bar-projection"
        style={{ left: position(projection, maximum) }}
      />
      <div
        className="range-bar-actual"
        style={{ left: position(actual, maximum) }}
      />
    </div>
  );
}

export function RangeAxis({ maximum }: { maximum: number }) {
  const ticks = [];
  for (let tick = 0; tick <= maximum; tick += TICK_SPACING) ticks.push(tick);
  return (
    <div className="range-axis" aria-hidden="true">
      {ticks.map((tick) => (
        <span key={tick} style={{ left: position(tick, maximum) }}>
          {tick}
        </span>
      ))}
    </div>
  );
}

const KEY_PARTS = [
  { label: "Floor", at: 14 },
  { label: "Projection", at: 44 },
  { label: "Ceiling", at: 70 },
  { label: "Actual", at: 90 },
];

export function RangeKey() {
  return (
    <figure className="range-key">
      <figcaption className="label">How to read a projection</figcaption>
      <div className="range-key-diagram" aria-hidden="true">
        {KEY_PARTS.map((part) => (
          <span
            key={part.label}
            className="range-key-label"
            style={{ left: `${part.at}%` }}
          >
            {part.label}
          </span>
        ))}
        <div className="range-bar range-bar-feature">
          <div
            className="range-bar-band"
            style={{ left: "14%", right: "30%" }}
          />
          <div className="range-bar-projection" style={{ left: "44%" }} />
          <div className="range-bar-actual" style={{ left: "90%" }} />
        </div>
      </div>
      <p className="note">
        The models expect four of every five results to land between floor and
        ceiling. The dot is what the player actually scored.
      </p>
    </figure>
  );
}
