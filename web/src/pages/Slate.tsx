import { useMemo, useRef } from "react";
import { Dropdown, Segmented } from "../components/Dropdown";
import { RangeAxis, RangeBar, RangeKey } from "../components/RangeBar";
import {
  POSITION_LABELS,
  PREDICTOR_LABELS,
  loadExplanation,
  type Dataset,
  type Position,
} from "../data";
import {
  formatCount,
  formatNumber,
  formatPercent,
  formatSigned,
  formatWeekdayDate,
} from "../format";
import { linkTo, navigate, type Route } from "../router";
import { coverage, summarize } from "../statistics";

const BUSY_SLATE = 150;
const SEASON_WIND_DOWN_DAYS = 7;
const PREFETCH_DWELL = 120;

// The final week is full of resting starters, so the first view opens on a normal busy night.
export function defaultSlateDate(dataset: Dataset): string {
  const candidates = dataset.dates.slice(0, -SEASON_WIND_DOWN_DAYS).reverse();
  return (
    candidates.find(
      (date) => (dataset.gamesByDate.get(date)?.length ?? 0) >= BUSY_SLATE,
    ) ?? dataset.dates[dataset.dates.length - 1]
  );
}

// Fetches a player's explanations once the pointer rests on their row, so the player page opens ready.
function usePrefetchOnDwell() {
  const timer = useRef<number | undefined>(undefined);
  return {
    start: (playerId: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => void loadExplanation(playerId).catch(() => undefined),
        PREFETCH_DWELL,
      );
    },
    cancel: () => window.clearTimeout(timer.current),
  };
}

export function Slate({ dataset, route }: { dataset: Dataset; route: Route }) {
  const { metrics, dates } = dataset;
  const prefetch = usePrefetchOnDwell();
  const requestedDate = route.parameters.get("date") ?? "";
  const date = dataset.gamesByDate.has(requestedDate)
    ? requestedDate
    : defaultSlateDate(dataset);
  const team = route.parameters.get("team") ?? "";
  const position = (route.parameters.get("position") ?? "all") as
    "all" | Position;

  const update = (changes: {
    date?: string;
    team?: string;
    position?: string;
  }) => {
    const next = { date, team, position, ...changes };
    navigate(
      "/",
      {
        date: next.date,
        team: next.team || undefined,
        position: next.position === "all" ? undefined : next.position,
      },
      true,
    );
  };

  const dayGames = dataset.gamesByDate.get(date)!;
  const shown = useMemo(
    () =>
      dayGames
        .filter(
          (game) =>
            (!team || game.team === team) &&
            (position === "all" || game.position === position),
        )
        .sort(
          (first, second) =>
            second.predicted.ensemble - first.predicted.ensemble,
        ),
    [dayGames, team, position],
  );

  const datePosition = dates.indexOf(date);
  const teamsPlaying = [...new Set(dayGames.map((game) => game.team))].sort();
  const maximum = Math.max(
    60,
    Math.ceil(
      Math.max(...dayGames.map((game) => Math.max(game.ceiling, game.actual))) /
        20,
    ) * 20,
  );
  const modelSummary = summarize(shown, "ensemble");
  const baselineSummary = summarize(shown, metrics.best_baseline);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Slate replay</h1>
          <p className="page-lede">
            Pick any game day from the {metrics.data.test_season} season. Every
            projection here was made by models trained only on earlier seasons,
            using stats that existed before tip-off, so each one can be checked
            against what happened.
          </p>
        </div>
        <RangeKey />
      </header>

      <div className="filter-row">
        <div className="stepper">
          <button
            type="button"
            aria-label="Previous game day"
            disabled={datePosition === 0}
            onClick={() => update({ date: dates[datePosition - 1], team: "" })}
          >
            <svg viewBox="0 0 6 10" aria-hidden="true">
              <path
                d="M5 1L1 5l4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
          <Dropdown
            label="Game day"
            searchable
            width={250}
            options={dates
              .map((option) => ({
                value: option,
                label: formatWeekdayDate(option),
              }))
              .reverse()}
            value={date}
            onChange={(value) => update({ date: value, team: "" })}
          />
          <button
            type="button"
            aria-label="Next game day"
            disabled={datePosition === dates.length - 1}
            onClick={() => update({ date: dates[datePosition + 1], team: "" })}
          >
            <svg viewBox="0 0 6 10" aria-hidden="true">
              <path
                d="M1 1l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>
        <Dropdown
          label="Team"
          options={[
            { value: "", label: "All teams" },
            ...teamsPlaying.map((option) => ({ value: option, label: option })),
          ]}
          value={team}
          onChange={(value) => update({ team: value })}
        />
        <Segmented
          label="Position"
          value={position}
          onChange={(value) => update({ position: value })}
          options={[
            { value: "all", label: "All" },
            { value: "guard", label: "G" },
            { value: "forward", label: "F" },
            { value: "center", label: "C" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <div className="status">
          <h2>No players match</h2>
          <p>
            <button
              type="button"
              className="text-button"
              onClick={() => update({ team: "", position: "all" })}
            >
              Clear the team and position filters
            </button>
          </p>
        </div>
      ) : (
        <section className="section section-stack">
          <div className="section-text">
            <h2 className="section-title">{formatWeekdayDate(date)}</h2>
            <p className="finding">
              The models projected{" "}
              <strong>{formatCount(shown.length)} players</strong> across{" "}
              <strong>{teamsPlaying.length / 2} games</strong> and missed by{" "}
              <strong>{formatNumber(modelSummary.mae)} fantasy points</strong>{" "}
              on average. A{" "}
              {PREDICTOR_LABELS[metrics.best_baseline].toLowerCase()} missed by{" "}
              {formatNumber(baselineSummary.mae)}, and{" "}
              <strong>{formatPercent(coverage(shown))}</strong> of results
              landed inside the projected range.
            </p>
          </div>

          <div className="scroll-x">
            <table className="data-table slate-table is-sticky is-linked">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="range-heading">
                    <span className="visually-hidden">
                      Projected range and result
                    </span>
                    <RangeAxis maximum={maximum} />
                  </th>
                  <th className="is-number">Floor</th>
                  <th className="is-number is-emphasis">Projection</th>
                  <th className="is-number">Ceiling</th>
                  <th className="is-number" title="Random Forest">
                    RF
                  </th>
                  <th className="is-number" title="XGBoost">
                    XGB
                  </th>
                  <th className="is-number">Actual</th>
                  <th className="is-number">Miss</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((game) => {
                  const player = dataset.playersById.get(game.playerId)!;
                  return (
                    <tr
                      key={game.playerId}
                      onClick={() =>
                        navigate(`/players/${game.playerId}`, { date })
                      }
                      onPointerEnter={() => prefetch.start(game.playerId)}
                      onPointerLeave={prefetch.cancel}
                    >
                      <td className="player-cell">
                        <a
                          className="row-link"
                          href={linkTo(`/players/${game.playerId}`, { date })}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {player.name}
                        </a>
                        <span className="tag">
                          {game.team} · {POSITION_LABELS[game.position][0]} ·{" "}
                          {game.isHome ? "vs" : "@"} {game.opponent}
                        </span>
                      </td>
                      <td className="range-cell">
                        <RangeBar
                          floor={game.floor}
                          ceiling={game.ceiling}
                          projection={game.predicted.ensemble}
                          actual={game.actual}
                          maximum={maximum}
                        />
                      </td>
                      <td className="is-number is-quiet">
                        {formatNumber(Math.max(0, game.floor))}
                      </td>
                      <td className="is-number is-emphasis">
                        {formatNumber(game.predicted.ensemble)}
                      </td>
                      <td className="is-number is-quiet">
                        {formatNumber(game.ceiling)}
                      </td>
                      <td className="is-number is-quiet">
                        {formatNumber(game.predicted.random_forest)}
                      </td>
                      <td className="is-number is-quiet">
                        {formatNumber(game.predicted.xgboost)}
                      </td>
                      <td className="is-number">{formatNumber(game.actual)}</td>
                      <td className="is-number">
                        {formatSigned(game.actual - game.predicted.ensemble)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note table-note">
            Projection is the ensemble:{" "}
            {formatNumber(metrics.ensemble.xgboost_weight, 2)} × XGBoost +{" "}
            {formatNumber(metrics.ensemble.random_forest_weight, 2)} × Random
            Forest, with the weights fitted on the{" "}
            {metrics.data.validation_season} season. Open a player to see why
            the model landed there.
          </p>
        </section>
      )}
    </div>
  );
}
