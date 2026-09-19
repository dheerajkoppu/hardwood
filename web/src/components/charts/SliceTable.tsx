import { Fragment } from "react";
import type { BaselineKey, Game } from "../../data";
import { formatCount, formatNumber, formatSigned } from "../../format";
import {
  SLICE_DEFINITIONS,
  improvementPercent,
  summarize,
} from "../../statistics";

export interface SliceRow {
  dimension: string;
  group: string;
  games: number;
  baselineError: number;
  ensembleError: number;
  improvement: number;
}

export const SMALL_SAMPLE = 30;

export function computeSlices(
  games: Game[],
  baseline: BaselineKey,
): SliceRow[] {
  return SLICE_DEFINITIONS.flatMap(({ dimension, groups }) =>
    groups.flatMap(({ label, includes }) => {
      const members = games.filter(includes);
      if (members.length === 0) return [];
      const baselineError = summarize(members, baseline).mae;
      const ensembleError = summarize(members, "ensemble").mae;
      return [
        {
          dimension,
          group: label,
          games: members.length,
          baselineError,
          ensembleError,
          improvement: improvementPercent(ensembleError, baselineError),
        },
      ];
    }),
  );
}

export function SliceTable({
  slices,
  baselineLabel,
}: {
  slices: SliceRow[];
  baselineLabel: string;
}) {
  const reach = Math.max(
    5,
    ...slices.map((slice) => Math.abs(slice.improvement)),
  );
  const hasLosses = slices.some((slice) => slice.improvement < 0);
  const zero = hasLosses ? 50 : 0;
  const unit = (hasLosses ? 50 : 100) / reach;

  return (
    <div className="scroll-x">
      <table className="data-table slice-table">
        <thead>
          <tr>
            <th>Games where</th>
            <th className="is-number">Games</th>
            <th className="is-number">{baselineLabel} MAE</th>
            <th className="is-number">Ensemble MAE</th>
            <th className="slice-bar-heading">Error removed by the model</th>
            <th className="is-number" />
          </tr>
        </thead>
        <tbody>
          {SLICE_DEFINITIONS.map(({ dimension }) => {
            const rows = slices.filter(
              (slice) => slice.dimension === dimension,
            );
            if (rows.length === 0) return null;
            return (
              <Fragment key={dimension}>
                <tr className="slice-dimension">
                  <th colSpan={6} scope="rowgroup">
                    {dimension}
                  </th>
                </tr>
                {rows.map((slice) => (
                  <tr
                    key={slice.group}
                    className={
                      slice.games < SMALL_SAMPLE ? "is-thin" : undefined
                    }
                  >
                    <td>
                      {slice.group}
                      {slice.games < SMALL_SAMPLE && (
                        <span className="tag">few games</span>
                      )}
                    </td>
                    <td className="is-number">{formatCount(slice.games)}</td>
                    <td className="is-number">
                      {formatNumber(slice.baselineError, 2)}
                    </td>
                    <td className="is-number">
                      {formatNumber(slice.ensembleError, 2)}
                    </td>
                    <td className="slice-bar-cell">
                      <div className="inline-bar">
                        <div
                          className="inline-bar-zero"
                          style={{ left: `${zero}%` }}
                        />
                        <div
                          className={
                            slice.improvement >= 0
                              ? "inline-bar-fill"
                              : "inline-bar-fill is-negative"
                          }
                          style={
                            slice.improvement >= 0
                              ? {
                                  left: `${zero}%`,
                                  width: `${slice.improvement * unit}%`,
                                }
                              : {
                                  right: `${100 - zero}%`,
                                  width: `${-slice.improvement * unit}%`,
                                }
                          }
                        />
                      </div>
                    </td>
                    <td className="is-number">
                      {formatSigned(slice.improvement, 1)}%
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
