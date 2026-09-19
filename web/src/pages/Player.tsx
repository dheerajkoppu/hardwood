import { useEffect, useState } from "react";
import { GameLog } from "../components/charts/GameLog";
import { comparisonText } from "../components/charts/Leaderboard";
import { Legend } from "../components/charts/parts";
import { WhyPanel } from "../components/charts/WhyPanel";
import { RangeAxis, RangeBar } from "../components/RangeBar";
import { DataTable } from "../components/Section";
import {
  POSITION_LABELS,
  PREDICTOR_COLORS,
  PREDICTOR_LABELS,
  loadExplanation,
  type Dataset,
  type Explanation,
  type ModelKey,
} from "../data";
import {
  formatNumber,
  formatPercent,
  formatShortDate,
  formatSigned,
  formatWeekdayDate,
} from "../format";
import { linkTo, navigate, type Route } from "../router";
import { coverage, summarize } from "../statistics";

const OPTIONAL_MODELS: ModelKey[] = ["xgboost", "random_forest"];

interface PlayerPageProps {
  dataset: Dataset;
  route: Route;
  playerId: number;
}

export function PlayerPage({ dataset, route, playerId }: PlayerPageProps) {
  const { metrics } = dataset;
  const player = dataset.playersById.get(playerId);
  const games = dataset.gamesByPlayer.get(playerId) ?? [];
  const [comparedModels, setComparedModels] = useState<ModelKey[]>([]);
  const [showsTable, setShowsTable] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setExplanation(null);
    loadExplanation(playerId)
      .then((loaded) => isCurrent && setExplanation(loaded))
      .catch(() => isCurrent && setExplanation({ base_value: NaN, games: {} }));
    return () => {
      isCurrent = false;
    };
  }, [playerId]);

  if (!player || games.length === 0) {
    return (
      <div className="status">
        <h2>Player not found</h2>
        <p>
          <a href={linkTo("/players")}>Browse all players</a>
        </p>
      </div>
    );
  }

  const requestedDate = route.parameters.get("date") ?? "";
  const selected =
    games.find((game) => game.date === requestedDate) ??
    games[games.length - 1];
  const selectDate = (date: string) =>
    navigate(`/players/${playerId}`, { date }, true);

  const modelSummary = summarize(games, "ensemble");
  const baselineSummary = summarize(games, metrics.best_baseline);
  const baselineLabel = PREDICTOR_LABELS[metrics.best_baseline].toLowerCase();
  const maximum = Math.max(
    60,
    Math.ceil(
      Math.max(...games.map((game) => Math.max(game.ceiling, game.actual))) /
        20,
    ) * 20,
  );
  const miss = selected.actual - selected.predicted.ensemble;
  const landedInside =
    selected.actual >= selected.floor && selected.actual <= selected.ceiling;

  const toggleModel = (model: ModelKey) =>
    setComparedModels((current) =>
      current.includes(model)
        ? current.filter((key) => key !== model)
        : [...current, model],
    );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <a className="back-link" href={linkTo("/players")}>
            All players
          </a>
          <h1 className="page-title">{player.name}</h1>
          <p className="page-lede">
            {player.team} · {POSITION_LABELS[player.position]} · {games.length}{" "}
            projected games in {metrics.data.test_season}
          </p>
        </div>
      </header>

      <section className="section section-lead">
        <div className="section-text">
          <h2 className="section-title">Season</h2>
          <p className="finding">
            Projected <em>{formatNumber(player.average_projection)}</em> a
            night, scored <em>{formatNumber(player.average_actual)}</em>.
          </p>
          <div className="section-support">
            <p className="note">
              The model missed by {formatNumber(modelSummary.mae, 2)} fantasy
              points on average,{" "}
              {comparisonText(modelSummary.mae, baselineSummary.mae)} than a{" "}
              {baselineLabel}. {formatPercent(coverage(games))} of games landed
              inside the projected range, against a target of{" "}
              {formatPercent(metrics.intervals.nominal_coverage)}.
            </p>
          </div>
        </div>
        <div className="section-figure">
          <div className="chart-toolbar">
            <Legend
              items={[
                { label: "Actual", color: "var(--ink)", mark: "dot" },
                { label: "Final projection", color: PREDICTOR_COLORS.ensemble },
                {
                  label: "Floor to ceiling",
                  color: "var(--leather-band)",
                  mark: "band",
                },
                ...comparedModels.map((model) => ({
                  label: PREDICTOR_LABELS[model],
                  color: PREDICTOR_COLORS[model],
                })),
              ]}
            />
            <div className="toggle-set">
              <span className="label">Overlay</span>
              <div
                className="toggle-group"
                role="group"
                aria-label="Overlay an individual model"
              >
                {OPTIONAL_MODELS.map((model) => (
                  <button
                    key={model}
                    type="button"
                    aria-pressed={comparedModels.includes(model)}
                    onClick={() => toggleModel(model)}
                  >
                    {PREDICTOR_LABELS[model]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <GameLog
            games={games}
            shownModels={comparedModels}
            selectedDate={selected.date}
            onSelect={selectDate}
          />
          <div className="section-support">
            <p className="note">
              Click any game, or use the arrow keys, to see how that projection
              was built.
            </p>
            <button
              type="button"
              className="text-button"
              aria-expanded={showsTable}
              onClick={() => setShowsTable(!showsTable)}
            >
              {showsTable ? "Hide the numbers" : "See the numbers"}
            </button>
          </div>
          {showsTable && (
            <div className="section-numbers">
              <DataTable
                columns={[
                  { label: "Date", align: "left" },
                  { label: "Game", align: "left" },
                  { label: "Floor" },
                  { label: "Projection" },
                  { label: "Ceiling" },
                  { label: "Random Forest" },
                  { label: "XGBoost" },
                  { label: "Actual" },
                  { label: "Miss" },
                ]}
                rows={games.map((game) => [
                  formatShortDate(game.date),
                  `${game.isHome ? "vs" : "@"} ${game.opponent}`,
                  formatNumber(Math.max(0, game.floor)),
                  formatNumber(game.predicted.ensemble),
                  formatNumber(game.ceiling),
                  formatNumber(game.predicted.random_forest),
                  formatNumber(game.predicted.xgboost),
                  formatNumber(game.actual),
                  formatSigned(game.actual - game.predicted.ensemble),
                ])}
              />
            </div>
          )}
        </div>
      </section>

      <section className="section section-stack game-detail">
        <div className="section-text">
          <h2 className="section-title">
            {formatWeekdayDate(selected.date)} · {selected.isHome ? "vs" : "@"}{" "}
            {selected.opponent}
          </h2>
          <p className="finding">
            The model projected{" "}
            <strong>{formatNumber(selected.predicted.ensemble)}</strong> with a
            likely range of {formatNumber(Math.max(0, selected.floor))} to{" "}
            {formatNumber(selected.ceiling)}. {player.name} scored{" "}
            <strong>{formatNumber(selected.actual)}</strong> in{" "}
            {formatNumber(selected.minutes, 0)} minutes,{" "}
            {landedInside ? "inside" : miss > 0 ? "above" : "below"} the range.
          </p>
        </div>

        <div className="game-grid">
          <div className="game-block">
            <h3 className="label">How the projection was blended</h3>
            <div className="feature-range">
              <RangeAxis maximum={maximum} />
              <RangeBar
                floor={selected.floor}
                ceiling={selected.ceiling}
                projection={selected.predicted.ensemble}
                actual={selected.actual}
                maximum={maximum}
                size="feature"
              />
            </div>
            <table className="data-table blend-table">
              <tbody>
                <tr>
                  <td>
                    <span
                      className="series-key"
                      style={{ background: PREDICTOR_COLORS.random_forest }}
                    />
                    Random Forest
                  </td>
                  <td className="is-number">
                    {formatNumber(selected.predicted.random_forest)}
                  </td>
                  <td className="is-number is-quiet">
                    × {formatNumber(metrics.ensemble.random_forest_weight, 2)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <span
                      className="series-key"
                      style={{ background: PREDICTOR_COLORS.xgboost }}
                    />
                    XGBoost
                  </td>
                  <td className="is-number">
                    {formatNumber(selected.predicted.xgboost)}
                  </td>
                  <td className="is-number is-quiet">
                    × {formatNumber(metrics.ensemble.xgboost_weight, 2)}
                  </td>
                </tr>
                <tr className="is-leader">
                  <td>
                    <span
                      className="series-key"
                      style={{ background: PREDICTOR_COLORS.ensemble }}
                    />
                    Final projection
                  </td>
                  <td className="is-number is-emphasis">
                    {formatNumber(selected.predicted.ensemble)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td>
                    <span
                      className="series-key is-dot"
                      style={{ background: "var(--ink)" }}
                    />
                    Actual
                  </td>
                  <td className="is-number">{formatNumber(selected.actual)}</td>
                  <td className="is-number is-quiet">{formatSigned(miss)}</td>
                </tr>
                <tr>
                  <td>
                    <span
                      className="series-key"
                      style={{
                        background: PREDICTOR_COLORS[metrics.best_baseline],
                      }}
                    />
                    {PREDICTOR_LABELS[metrics.best_baseline]}
                  </td>
                  <td className="is-number is-quiet">
                    {formatNumber(selected.predicted[metrics.best_baseline])}
                  </td>
                  <td className="is-number is-quiet">
                    {formatSigned(
                      selected.actual -
                        selected.predicted[metrics.best_baseline],
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="note">
              Blend weights were fitted on the {metrics.data.validation_season}{" "}
              season and never adjusted afterward.
            </p>
          </div>

          <div className="game-block">
            <h3 className="label">Why the model landed here</h3>
            <WhyPanel
              explanation={explanation}
              date={selected.date}
              features={metrics.features}
            />
            <p className="note">
              SHAP values for the XGBoost model: each bar is how many fantasy
              points that input added or removed for this game. They sum to the
              XGBoost projection.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
