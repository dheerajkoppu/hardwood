import type { Game, PredictorKey, Scores } from "./data";

export interface Summary extends Scores {
  games: number;
  bias: number;
  spread: number;
}

export function summarize(games: Game[], predictor: PredictorKey): Summary {
  const count = games.length;
  if (count === 0)
    return { games: 0, mae: NaN, rmse: NaN, r2: NaN, bias: NaN, spread: NaN };

  let absoluteTotal = 0;
  let squaredTotal = 0;
  let residualTotal = 0;
  let actualTotal = 0;
  for (const game of games) {
    const residual = game.actual - game.predicted[predictor];
    absoluteTotal += Math.abs(residual);
    squaredTotal += residual * residual;
    residualTotal += residual;
    actualTotal += game.actual;
  }
  const actualMean = actualTotal / count;
  let totalVariation = 0;
  for (const game of games) totalVariation += (game.actual - actualMean) ** 2;

  const bias = residualTotal / count;
  return {
    games: count,
    mae: absoluteTotal / count,
    rmse: Math.sqrt(squaredTotal / count),
    r2: totalVariation > 0 ? 1 - squaredTotal / totalVariation : NaN,
    bias,
    spread: Math.sqrt(Math.max(0, squaredTotal / count - bias * bias)),
  };
}

export function improvementPercent(
  modelError: number,
  baselineError: number,
): number {
  return 100 * (1 - modelError / baselineError);
}

export function coverage(games: Game[]): number {
  if (games.length === 0) return NaN;
  const inside = games.filter(
    (game) => game.actual >= game.floor && game.actual <= game.ceiling,
  ).length;
  return inside / games.length;
}

export function averageBandWidth(games: Game[]): number {
  if (games.length === 0) return NaN;
  return (
    games.reduce((total, game) => total + (game.ceiling - game.floor), 0) /
    games.length
  );
}

export interface CalibrationBucket {
  bucket: number;
  games: number;
  predictedMean: number;
  actualMean: number;
}

export function calibrationBuckets(
  games: Game[],
  predictor: PredictorKey,
  maximumBuckets = 10,
): CalibrationBucket[] {
  const bucketCount = Math.min(maximumBuckets, Math.floor(games.length / 10));
  if (bucketCount < 2) return [];
  const ordered = [...games].sort(
    (first, second) => first.predicted[predictor] - second.predicted[predictor],
  );
  const buckets: CalibrationBucket[] = [];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const members = ordered.slice(
      Math.floor((bucket * ordered.length) / bucketCount),
      Math.floor(((bucket + 1) * ordered.length) / bucketCount),
    );
    buckets.push({
      bucket: bucket + 1,
      games: members.length,
      predictedMean:
        members.reduce((total, game) => total + game.predicted[predictor], 0) /
        members.length,
      actualMean:
        members.reduce((total, game) => total + game.actual, 0) /
        members.length,
    });
  }
  return buckets;
}

export interface HistogramBin {
  start: number;
  end: number;
  games: number;
}

export const RESIDUAL_LIMIT = 40;
export const RESIDUAL_BIN_WIDTH = 2.5;

// Residuals beyond the limit are counted in the outermost bins.
export function residualHistogram(
  games: Game[],
  predictor: PredictorKey,
): HistogramBin[] {
  const binCount = (2 * RESIDUAL_LIMIT) / RESIDUAL_BIN_WIDTH;
  const bins: HistogramBin[] = Array.from(
    { length: binCount },
    (_, position) => ({
      start: -RESIDUAL_LIMIT + position * RESIDUAL_BIN_WIDTH,
      end: -RESIDUAL_LIMIT + (position + 1) * RESIDUAL_BIN_WIDTH,
      games: 0,
    }),
  );
  for (const game of games) {
    const residual = game.actual - game.predicted[predictor];
    const position = Math.floor(
      (residual + RESIDUAL_LIMIT) / RESIDUAL_BIN_WIDTH,
    );
    bins[Math.min(binCount - 1, Math.max(0, position))].games += 1;
  }
  return bins;
}

export const MINUTES_TIERS: {
  label: string;
  minimum: number;
  maximum: number;
}[] = [
  { label: "Under 15 min", minimum: -Infinity, maximum: 15 },
  { label: "15 to 25 min", minimum: 15, maximum: 25 },
  { label: "25 to 32 min", minimum: 25, maximum: 32 },
  { label: "32+ min", minimum: 32, maximum: Infinity },
];

export interface SliceDefinition {
  dimension: string;
  groups: { label: string; includes: (game: Game) => boolean }[];
}

export const SLICE_DEFINITIONS: SliceDefinition[] = [
  {
    dimension: "Position",
    groups: [
      { label: "Guards", includes: (game) => game.position === "guard" },
      { label: "Forwards", includes: (game) => game.position === "forward" },
      { label: "Centers", includes: (game) => game.position === "center" },
    ],
  },
  {
    dimension: "Typical minutes",
    groups: MINUTES_TIERS.map((tier) => ({
      label: tier.label,
      includes: (game: Game) =>
        game.typicalMinutes >= tier.minimum &&
        game.typicalMinutes < tier.maximum,
    })),
  },
  {
    dimension: "Schedule",
    groups: [
      { label: "Rested", includes: (game) => !game.isBackToBack },
      { label: "Back-to-back", includes: (game) => game.isBackToBack },
    ],
  },
  {
    dimension: "Teammates",
    groups: [
      { label: "Full strength", includes: (game) => !game.keyTeammateOut },
      { label: "Key teammate out", includes: (game) => game.keyTeammateOut },
    ],
  },
  {
    dimension: "Venue",
    groups: [
      { label: "Home", includes: (game) => game.isHome },
      { label: "Away", includes: (game) => !game.isHome },
    ],
  },
];
