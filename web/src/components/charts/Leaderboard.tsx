import { scaleLinear } from "d3-scale";
import {
  PREDICTOR_COLORS,
  PREDICTOR_LABELS,
  type PredictorKey,
} from "../../data";
import { formatNumber } from "../../format";
import { improvementPercent, type Summary } from "../../statistics";

export interface LeaderboardRow {
  key: PredictorKey;
  kind: "baseline" | "model";
  summary: Summary;
}

interface LeaderboardProps {
  rows: LeaderboardRow[];
  bestBaseline: LeaderboardRow;
  bestModel: LeaderboardRow;
}

export function comparisonText(
  modelError: number,
  baselineError: number,
): string {
  const improvement = improvementPercent(modelError, baselineError);
  if (!Number.isFinite(improvement)) return "–";
  return `${formatNumber(Math.abs(improvement), 1)}% ${improvement >= 0 ? "better" : "worse"}`;
}

export function Leaderboard({
  rows,
  bestBaseline,
  bestModel,
}: LeaderboardProps) {
  const errors = rows.map((row) => row.summary.mae);
  const padding = Math.max(
    0.05,
    (Math.max(...errors) - Math.min(...errors)) * 0.15,
  );
  const scale = scaleLinear()
    .domain([Math.min(...errors) - padding, Math.max(...errors) + padding])
    .range([0, 100]);
  const ticks = scale.ticks(4);
  const baselinePosition = `${scale(bestBaseline.summary.mae)}%`;

  return (
    <div className="scroll-x">
      <table className="data-table leaderboard">
        <thead>
          <tr>
            <th>Model</th>
            <th className="leaderboard-plot-heading">
              <span className="visually-hidden">Average miss, plotted</span>
              <div className="leaderboard-axis" aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={tick} style={{ left: `${scale(tick)}%` }}>
                    {formatNumber(tick, 1)}
                  </span>
                ))}
              </div>
            </th>
            <th className="is-number">Avg miss (MAE)</th>
            <th className="is-number">RMSE</th>
            <th className="is-number">R²</th>
            <th className="is-number">vs best baseline</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isBestModel = row.key === bestModel.key;
            const isBestBaseline = row.key === bestBaseline.key;
            return (
              <tr
                key={row.key}
                className={isBestModel ? "is-leader" : undefined}
              >
                <td>
                  <span
                    className="series-key"
                    style={{ background: PREDICTOR_COLORS[row.key] }}
                  />
                  {PREDICTOR_LABELS[row.key]}
                  {row.kind === "baseline" && (
                    <span className="tag">baseline</span>
                  )}
                </td>
                <td className="leaderboard-plot">
                  <div className="dot-plot">
                    <div
                      className="dot-plot-reference"
                      style={{ left: baselinePosition }}
                    />
                    <div
                      className="dot-plot-dot"
                      style={{
                        left: `${scale(row.summary.mae)}%`,
                        background: PREDICTOR_COLORS[row.key],
                      }}
                    />
                  </div>
                </td>
                <td className="is-number">
                  {formatNumber(row.summary.mae, 2)}
                </td>
                <td className="is-number">
                  {formatNumber(row.summary.rmse, 2)}
                </td>
                <td className="is-number">{formatNumber(row.summary.r2, 3)}</td>
                <td className="is-number">
                  {isBestBaseline
                    ? "reference"
                    : comparisonText(row.summary.mae, bestBaseline.summary.mae)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
