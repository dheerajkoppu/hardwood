import { useMemo, useState } from "react";
import { comparisonText } from "../components/charts/Leaderboard";
import { Dropdown, Segmented } from "../components/Dropdown";
import { Dumbbell, RangeAxis } from "../components/RangeBar";
import {
  POSITION_LABELS,
  PREDICTOR_LABELS,
  type Dataset,
  type Position,
} from "../data";
import { formatNumber } from "../format";
import { linkTo, navigate, type Route } from "../router";
import { summarize } from "../statistics";

type SortKey = "name" | "games" | "projection" | "actual" | "miss";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "games", label: "Games" },
  { key: "projection", label: "Avg projection" },
  { key: "actual", label: "Avg actual" },
  { key: "miss", label: "Avg miss" },
];

export function Players({
  dataset,
  route,
}: {
  dataset: Dataset;
  route: Route;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("projection");
  const [isDescending, setIsDescending] = useState(true);
  const team = route.parameters.get("team") ?? "";
  const position = (route.parameters.get("position") ?? "all") as
    "all" | Position;
  const baseline = dataset.metrics.best_baseline;

  const update = (changes: { team?: string; position?: string }) => {
    const next = { team, position, ...changes };
    navigate(
      "/players",
      {
        team: next.team || undefined,
        position: next.position === "all" ? undefined : next.position,
      },
      true,
    );
  };

  const rows = useMemo(
    () =>
      dataset.players.map((player) => {
        const games = dataset.gamesByPlayer.get(player.id) ?? [];
        return {
          player,
          games: games.length,
          projection: player.average_projection,
          actual: player.average_actual,
          miss: summarize(games, "ensemble").mae,
          baselineMiss: summarize(games, baseline).mae,
        };
      }),
    [dataset, baseline],
  );
  const maximum = useMemo(
    () =>
      Math.ceil(
        Math.max(...rows.map((row) => Math.max(row.projection, row.actual))) /
          20,
      ) * 20,
    [rows],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const direction = isDescending ? -1 : 1;
    return rows
      .filter(
        ({ player }) =>
          (!needle || player.name.toLowerCase().includes(needle)) &&
          (!team || player.team === team) &&
          (position === "all" || player.position === position),
      )
      .sort((first, second) =>
        sortKey === "name"
          ? direction * first.player.name.localeCompare(second.player.name)
          : direction * (first[sortKey] - second[sortKey]),
      );
  }, [rows, query, team, position, sortKey, isDescending]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setIsDescending(!isDescending);
    else {
      setSortKey(key);
      setIsDescending(key !== "name");
    }
  };
  const sortState = (key: SortKey) =>
    key === sortKey ? (isDescending ? "descending" : "ascending") : "none";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Players</h1>
          <p className="page-lede">
            All {dataset.players.length} players the models projected in{" "}
            {dataset.metrics.data.test_season}. Open one to see every projection
            against the result, and what drove each call.
          </p>
        </div>
      </header>

      <div className="filter-row">
        <label className="search">
          <span className="visually-hidden">Search players</span>
          <input
            type="search"
            placeholder="Search players"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Dropdown
          label="Team"
          searchable
          options={[
            { value: "", label: "All teams" },
            ...dataset.teams.map((option) => ({
              value: option,
              label: option,
            })),
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
        <div className="filter-count figure">{shown.length} players</div>
      </div>

      {shown.length === 0 ? (
        <div className="status">
          <h2>No players match</h2>
          <p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery("");
                update({ team: "", position: "all" });
              }}
            >
              Clear the search and filters
            </button>
          </p>
        </div>
      ) : (
        <div className="scroll-x table-block">
          <table className="data-table is-sticky is-linked">
            <thead>
              <tr>
                <th aria-sort={sortState("name")}>
                  <button
                    type="button"
                    className="sort-button"
                    onClick={() => sortBy("name")}
                  >
                    Player
                  </button>
                </th>
                <th className="range-heading">
                  <span className="visually-hidden">
                    Average projection against average actual
                  </span>
                  <RangeAxis maximum={maximum} />
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className="is-number"
                    aria-sort={sortState(column.key)}
                  >
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() => sortBy(column.key)}
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
                <th className="is-number">
                  vs {PREDICTOR_LABELS[baseline].toLowerCase()}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(
                ({ player, games, projection, actual, miss, baselineMiss }) => (
                  <tr
                    key={player.id}
                    onClick={() => navigate(`/players/${player.id}`)}
                  >
                    <td className="player-cell">
                      <a
                        className="row-link"
                        href={linkTo(`/players/${player.id}`)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {player.name}
                      </a>
                      <span className="tag">
                        {player.team} · {POSITION_LABELS[player.position][0]}
                      </span>
                    </td>
                    <td className="range-cell">
                      <Dumbbell
                        projection={projection}
                        actual={actual}
                        maximum={maximum}
                      />
                    </td>
                    <td className="is-number is-quiet">{games}</td>
                    <td className="is-number is-emphasis">
                      {formatNumber(projection)}
                    </td>
                    <td className="is-number">{formatNumber(actual)}</td>
                    <td className="is-number">{formatNumber(miss, 2)}</td>
                    <td className="is-number is-quiet">
                      {comparisonText(miss, baselineMiss)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
