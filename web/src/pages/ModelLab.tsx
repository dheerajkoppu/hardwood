import { useDeferredValue, useMemo, useState } from "react";
import {
  CalibrationChart,
  CoverageMeter,
} from "../components/charts/CalibrationChart";
import {
  ImportanceBars,
  MEASURES,
  MeasurePicker,
  rankFeatures,
  type Measure,
} from "../components/charts/ImportanceBars";
import {
  Leaderboard,
  comparisonText,
  type LeaderboardRow,
} from "../components/charts/Leaderboard";
import { ResidualPanels } from "../components/charts/ResidualPanels";
import {
  DENSITY_THRESHOLD,
  ScatterPanels,
} from "../components/charts/ScatterPanels";
import {
  SMALL_SAMPLE,
  SliceTable,
  computeSlices,
} from "../components/charts/SliceTable";
import {
  FilterRow,
  applyFilters,
  defaultFilters,
  type Filters,
} from "../components/FilterRow";
import { Section } from "../components/Section";
import {
  BASELINE_KEYS,
  COMPARED_MODELS,
  PREDICTOR_KEYS,
  PREDICTOR_LABELS,
  type BaselineKey,
  type Dataset,
  type Position,
} from "../data";
import {
  formatCount,
  formatDate,
  formatNumber,
  formatPercent,
  formatSigned,
} from "../format";
import { navigate, type Route } from "../router";
import {
  calibrationBuckets,
  residualHistogram,
  summarize,
} from "../statistics";

const LARGE_MISS = 20;

function readFilters(route: Route, dataset: Dataset): Filters {
  const defaults = defaultFilters(dataset);
  const from = route.parameters.get("from") ?? defaults.from;
  const to = route.parameters.get("to") ?? defaults.to;
  return {
    player: route.parameters.get("player") ?? "",
    team: route.parameters.get("team") ?? "",
    position: (route.parameters.get("position") ?? "all") as "all" | Position,
    from: from <= to ? from : defaults.from,
    to: from <= to ? to : defaults.to,
  };
}

function writeFilters(filters: Filters, dataset: Dataset): void {
  const defaults = defaultFilters(dataset);
  navigate(
    "/lab",
    {
      player: filters.player || undefined,
      team: filters.team || undefined,
      position: filters.position === "all" ? undefined : filters.position,
      from: filters.from === defaults.from ? undefined : filters.from,
      to: filters.to === defaults.to ? undefined : filters.to,
    },
    true,
  );
}

export function ModelLab({
  dataset,
  route,
}: {
  dataset: Dataset;
  route: Route;
}) {
  const { metrics, importance } = dataset;
  const [measure, setMeasure] = useState<Measure>("shap");
  const filters = useMemo(() => readFilters(route, dataset), [route, dataset]);
  const appliedFilters = useDeferredValue(filters);
  const games = useMemo(
    () => applyFilters(dataset.games, appliedFilters),
    [dataset.games, appliedFilters],
  );
  const isUnfiltered = games.length === dataset.games.length;

  const analysis = useMemo(() => {
    if (games.length === 0) return null;
    const rows: LeaderboardRow[] = PREDICTOR_KEYS.map((key) => ({
      key,
      kind: (BASELINE_KEYS as string[]).includes(key)
        ? ("baseline" as const)
        : ("model" as const),
      summary: summarize(games, key),
    })).sort((first, second) => first.summary.mae - second.summary.mae);
    const bestBaseline = rows.find((row) => row.kind === "baseline")!;
    const bestModel = rows.find((row) => row.kind === "model")!;
    const ensemble = rows.find((row) => row.key === "ensemble")!.summary;

    const residuals = games.map(
      (game) => game.actual - game.predicted.ensemble,
    );
    const slices = computeSlices(games, bestBaseline.key as BaselineKey);
    const reliableSlices = slices
      .filter((slice) => slice.games >= SMALL_SAMPLE)
      .sort((first, second) => second.improvement - first.improvement);
    const buckets = calibrationBuckets(games, "ensemble");

    return {
      rows,
      bestBaseline,
      bestModel,
      ensemble,
      slices,
      strongestSlice: reliableSlices[0],
      weakestSlice: reliableSlices[reliableSlices.length - 1],
      beatByLargeMargin:
        residuals.filter((residual) => residual > LARGE_MISS).length /
        games.length,
      fellShortByLargeMargin:
        residuals.filter((residual) => residual < -LARGE_MISS).length /
        games.length,
      buckets,
      worstBucketGap: Math.max(
        0,
        ...buckets.map((bucket) =>
          Math.abs(bucket.actualMean - bucket.predictedMean),
        ),
      ),
      histograms: COMPARED_MODELS.map((model) =>
        residualHistogram(games, model),
      ),
    };
  }, [games]);

  const shapRanking = useMemo(
    () => rankFeatures(importance, metrics.features, "shap"),
    [importance, metrics.features],
  );
  const topContext = shapRanking.findIndex(
    ({ feature }) => !["Form", "Minutes"].includes(feature.group),
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Model Lab</h1>
          <p className="page-lede">
            Every number on this page is computed in your browser from{" "}
            {formatCount(dataset.games.length)} projections for the{" "}
            {metrics.data.test_season} season, which the models never saw during
            training.
          </p>
        </div>
        <dl className="fact-sheet">
          <div>
            <dt>Tested on</dt>
            <dd>{metrics.data.test_season} season</dd>
          </div>
          <div>
            <dt>Trained on</dt>
            <dd>{formatCount(metrics.data.fit_rows)} player-games</dd>
          </div>
          <div>
            <dt>Trained through</dt>
            <dd>{formatDate(metrics.data.trained_through)}</dd>
          </div>
          <div>
            <dt>Inputs</dt>
            <dd>{metrics.features.length}, all from earlier games</dd>
          </div>
        </dl>
      </header>

      <div className="filter-bar">
        <FilterRow
          dataset={dataset}
          filters={filters}
          matching={games.length}
          onChange={(next) => writeFilters(next, dataset)}
        />
      </div>

      {!analysis ? (
        <div className="status">
          <h2>No games match these filters</h2>
          <p>
            <button
              type="button"
              className="text-button"
              onClick={() => writeFilters(defaultFilters(dataset), dataset)}
            >
              Reset the filters
            </button>
          </p>
        </div>
      ) : (
        <div className={appliedFilters === filters ? undefined : "pending"}>
          {games.length < SMALL_SAMPLE && (
            <p className="warning" role="status">
              Only {games.length} games match. Metrics on fewer than{" "}
              {SMALL_SAMPLE} games swing widely, so treat these as anecdotes.
            </p>
          )}

          <Section
            layout="lead"
            title="Leaderboard"
            finding={
              <>
                {PREDICTOR_LABELS[analysis.bestModel.key]} misses by{" "}
                <em>
                  {formatNumber(analysis.bestModel.summary.mae, 2)} fantasy
                  points
                </em>{" "}
                on average,{" "}
                {comparisonText(
                  analysis.bestModel.summary.mae,
                  analysis.bestBaseline.summary.mae,
                )}{" "}
                than the best naive baseline.
              </>
            }
            note={
              <>
                The baseline to beat is a player's{" "}
                {PREDICTOR_LABELS[analysis.bestBaseline.key].toLowerCase()},
                which misses by{" "}
                {formatNumber(analysis.bestBaseline.summary.mae, 2)}. Every dot
                left of the vertical line beats it.
                {isUnfiltered && (
                  <>
                    {" "}
                    Across the full season the ensemble's edge has a 95%
                    interval of{" "}
                    {formatNumber(metrics.improvement.interval_low, 1)}% to{" "}
                    {formatNumber(metrics.improvement.interval_high, 1)}%
                    (bootstrap over game days). It is steady and small because a
                    recent average already captures most of what can be known
                    before tip-off.
                  </>
                )}
              </>
            }
          >
            <Leaderboard
              rows={analysis.rows}
              bestBaseline={analysis.bestBaseline}
              bestModel={analysis.bestModel}
            />
          </Section>

          <Section
            title="Projected vs actual"
            finding={
              analysis.ensemble.r2 > 0 ? (
                <>
                  The ensemble's projections explain{" "}
                  <strong>{formatPercent(analysis.ensemble.r2)}</strong> of the
                  variation in fantasy points across these games. The spread
                  around the diagonal is the part no model captured.
                </>
              ) : (
                <>
                  Inside this slice the projections do no better than the
                  slice's own average (R²{" "}
                  {formatNumber(analysis.ensemble.r2, 2)}). Most of the model's
                  skill is telling players and roles apart, so a narrow slice
                  leaves it little to explain.
                </>
              )
            }
            note={
              games.length > DENSITY_THRESHOLD
                ? "Each hexagon is a group of games; darker means more games. Narrow the filters to see individual games."
                : "Each dot is one game. Click a dot to open that player."
            }
            table={{
              columns: [
                { label: "Model", align: "left" },
                { label: "MAE" },
                { label: "RMSE" },
                { label: "R²" },
              ],
              rows: analysis.rows
                .filter((row) =>
                  (COMPARED_MODELS as string[]).includes(row.key),
                )
                .map((row) => [
                  PREDICTOR_LABELS[row.key],
                  formatNumber(row.summary.mae, 2),
                  formatNumber(row.summary.rmse, 2),
                  formatNumber(row.summary.r2, 3),
                ]),
            }}
          >
            <ScatterPanels games={games} playersById={dataset.playersById} />
          </Section>

          <Section
            title="Residuals"
            finding={
              <>
                The ensemble's average miss is{" "}
                <strong>{formatSigned(analysis.ensemble.bias, 2)}&nbsp;FP</strong>{" "}
                (positive means players outscored it) with a typical spread of{" "}
                <strong>{formatNumber(analysis.ensemble.spread)}&nbsp;FP</strong>.
              </>
            }
            note={
              <>
                Players beat the projection by {LARGE_MISS}+ in{" "}
                {formatPercent(analysis.beatByLargeMargin, 1)} of games and fell
                short by {LARGE_MISS}+ in{" "}
                {formatPercent(analysis.fellShortByLargeMargin, 1)}.
              </>
            }
            table={{
              columns: [
                { label: "Actual minus projected (FP)", align: "left" },
                ...COMPARED_MODELS.map((model) => ({
                  label: PREDICTOR_LABELS[model],
                })),
              ],
              rows: analysis.histograms[0].map((bin, position) => [
                `${formatSigned(bin.start, 1)} to ${formatSigned(bin.end, 1)}`,
                ...analysis.histograms.map((bins) =>
                  formatCount(bins[position].games),
                ),
              ]),
            }}
          >
            <ResidualPanels games={games} />
          </Section>

          <Section
            title="Calibration"
            finding={
              <>
                From the lowest projections to the highest, the ensemble's
                average projection stays within{" "}
                <strong>{formatNumber(analysis.worstBucketGap, 2)}&nbsp;FP</strong>{" "}
                of the average result.
              </>
            }
            note="Games are sorted by projection and split into equal groups. A flat line at zero means a 40-point projection really does average 40."
            table={{
              columns: [
                { label: "Group", align: "left" },
                { label: "Games" },
                { label: "Avg projection" },
                { label: "Avg actual" },
                { label: "Gap" },
              ],
              rows: analysis.buckets.map((bucket) => [
                `Ensemble ${bucket.bucket}`,
                formatCount(bucket.games),
                formatNumber(bucket.predictedMean, 2),
                formatNumber(bucket.actualMean, 2),
                formatSigned(bucket.actualMean - bucket.predictedMean, 2),
              ]),
            }}
          >
            <CalibrationChart games={games} />
            <CoverageMeter
              games={games}
              target={metrics.intervals.nominal_coverage}
            />
          </Section>

          <Section
            layout="stack"
            title="Where the model helps"
            finding={
              analysis.strongestSlice &&
              analysis.strongestSlice !== analysis.weakestSlice ? (
                <>
                  Against the{" "}
                  {PREDICTOR_LABELS[analysis.bestBaseline.key].toLowerCase()},
                  the ensemble removes the most error for{" "}
                  <strong>{analysis.strongestSlice.group.toLowerCase()}</strong>{" "}
                  ({formatSigned(analysis.strongestSlice.improvement, 1)}%) and
                  the least for{" "}
                  <strong>{analysis.weakestSlice.group.toLowerCase()}</strong> (
                  {formatSigned(analysis.weakestSlice.improvement, 1)}%).
                </>
              ) : (
                <>
                  Too few games in each group to compare them. Widen the
                  filters.
                </>
              )
            }
          >
            <SliceTable
              slices={analysis.slices}
              baselineLabel={PREDICTOR_LABELS[analysis.bestBaseline.key]}
            />
          </Section>
        </div>
      )}

      <Section
        title="What drives the projections"
        finding={
          <>
            <strong>{shapRanking[0].feature.label}</strong> moves XGBoost's
            projections the most, by{" "}
            {MEASURES.shap.format(shapRanking[0].value)} on average. Beyond a
            player's own form and minutes, the strongest input is{" "}
            <strong>
              {shapRanking[topContext].feature.label.toLowerCase()}
            </strong>
            , ranked {topContext + 1} of {metrics.features.length}.
          </>
        }
        note={`Computed once on the full ${metrics.data.test_season} season, so the filters above do not change it.`}
        aside={<MeasurePicker measure={measure} onChange={setMeasure} />}
        table={{
          columns: [
            { label: "Input", align: "left" },
            { label: "Group", align: "left" },
            { label: "SHAP (FP)" },
            { label: "Gain share" },
            { label: "Permutation (FP)" },
            { label: "Impurity share" },
          ],
          rows: shapRanking.map(({ feature }) => {
            const position = metrics.features.indexOf(feature);
            const share = (values: number[]) =>
              formatPercent(
                values[position] /
                  values.reduce((total, value) => total + value, 0),
                1,
              );
            return [
              feature.label,
              feature.group,
              formatNumber(importance.shap[position], 2),
              share(importance.xgboost_gain),
              formatNumber(importance.random_forest_permutation[position], 3),
              share(importance.random_forest_impurity),
            ];
          }),
        }}
      >
        <ImportanceBars
          importance={importance}
          features={metrics.features}
          measure={measure}
        />
      </Section>
    </div>
  );
}
