import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSlices } from "./components/charts/SliceTable";
import { buildGames, type Metrics } from "./data";
import { coverage, summarize } from "./statistics";

function readData<Payload>(name: string): Payload {
  return JSON.parse(
    readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf8"),
  ) as Payload;
}

const metrics = readData<Metrics>("metrics.json");
const games = buildGames(readData("predictions.json"));

describe("browser statistics match the training run", () => {
  it("loads every test-season projection", () => {
    expect(games).toHaveLength(metrics.data.test_rows);
  });

  it.each(metrics.leaderboard)(
    "reproduces MAE, RMSE and R² for $label",
    (entry) => {
      const summary = summarize(games, entry.key);
      expect(summary.mae).toBeCloseTo(entry.test.mae, 6);
      expect(summary.rmse).toBeCloseTo(entry.test.rmse, 6);
      expect(summary.r2).toBeCloseTo(entry.test.r2, 6);
    },
  );

  it("reproduces the floor-to-ceiling coverage", () => {
    expect(coverage(games)).toBeCloseTo(
      metrics.intervals.calibrated_coverage,
      9,
    );
  });

  it("reproduces every error slice", () => {
    const slices = computeSlices(games, metrics.best_baseline);
    expect(slices).toHaveLength(metrics.slices.length);
    for (const expected of metrics.slices) {
      const slice = slices.find(
        (row) =>
          row.dimension === expected.dimension && row.group === expected.group,
      );
      expect(slice, `${expected.dimension}: ${expected.group}`).toBeDefined();
      expect(slice!.games).toBe(expected.games);
      expect(slice!.ensembleError).toBeCloseTo(expected.ensemble_mae, 6);
      expect(slice!.baselineError).toBeCloseTo(expected.baseline_mae, 6);
    }
  });
});

describe("summarize", () => {
  it("returns empty scores for no games", () => {
    expect(summarize([], "ensemble").games).toBe(0);
    expect(summarize([], "ensemble").mae).toBeNaN();
  });
});
