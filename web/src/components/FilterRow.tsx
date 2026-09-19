import { useEffect, useRef, useState } from "react";
import {
  POSITION_LABELS,
  type Dataset,
  type Game,
  type Position,
} from "../data";
import { formatCount, formatShortDate } from "../format";
import { Dropdown, Segmented } from "./Dropdown";

export interface Filters {
  player: string;
  team: string;
  position: "all" | Position;
  from: string;
  to: string;
}

export function applyFilters(games: Game[], filters: Filters): Game[] {
  const playerId = filters.player ? Number(filters.player) : null;
  return games.filter(
    (game) =>
      (playerId === null || game.playerId === playerId) &&
      (!filters.team || game.team === filters.team) &&
      (filters.position === "all" || game.position === filters.position) &&
      game.date >= filters.from &&
      game.date <= filters.to,
  );
}

interface DatePreset {
  label: string;
  from: string;
  to: string;
}

function datePresets(dates: string[]): DatePreset[] {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const within = (start: string, end: string) =>
    dates.filter((date) => date >= start && date <= end);
  const startYear = first.slice(0, 4);
  const endYear = last.slice(0, 4);
  const lastThirty = new Date(Date.parse(last) - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const ranges: [string, string, string][] = [
    ["Full season", first, last],
    ["October to December", `${startYear}-10-01`, `${startYear}-12-31`],
    ["January and February", `${endYear}-01-01`, `${endYear}-02-29`],
    ["March and April", `${endYear}-03-01`, `${endYear}-04-30`],
    ["Final 30 days", lastThirty, last],
  ];
  return ranges.flatMap(([label, start, end]) => {
    const covered = within(start, end);
    return covered.length
      ? [{ label, from: covered[0], to: covered[covered.length - 1] }]
      : [];
  });
}

interface DateRangeProps {
  dates: string[];
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

function DateRange({ dates, from, to, onChange }: DateRangeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const presets = datePresets(dates);
  const activePreset = presets.find(
    (preset) => preset.from === from && preset.to === to,
  );
  const dateOptions = dates.map((date) => ({
    value: date,
    label: formatShortDate(date),
  }));

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="dropdown" ref={container}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="dropdown-label">Dates</span>
        <span className="dropdown-value">
          {activePreset?.label ??
            `${formatShortDate(from)} to ${formatShortDate(to)}`}
        </span>
        <svg className="dropdown-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          className="dropdown-panel date-panel"
          role="dialog"
          aria-label="Date range"
        >
          <ul className="dropdown-list">
            {presets.map((preset) => (
              <li
                key={preset.label}
                role="button"
                tabIndex={0}
                aria-pressed={preset === activePreset}
                onClick={() => {
                  onChange(preset.from, preset.to);
                  setIsOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onChange(preset.from, preset.to);
                    setIsOpen(false);
                  }
                }}
              >
                <span>{preset.label}</span>
                {preset === activePreset && (
                  <svg className="check" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M3 8.5l3.5 3.5L13 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                )}
              </li>
            ))}
          </ul>
          <div className="date-custom">
            <Dropdown
              label="From"
              searchable
              options={dateOptions.filter((option) => option.value <= to)}
              value={from}
              onChange={(value) => onChange(value, to)}
            />
            <Dropdown
              label="To"
              searchable
              options={dateOptions.filter((option) => option.value >= from)}
              value={to}
              onChange={(value) => onChange(from, value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterRowProps {
  dataset: Dataset;
  filters: Filters;
  matching: number;
  onChange: (filters: Filters) => void;
}

export function defaultFilters(dataset: Dataset): Filters {
  return {
    player: "",
    team: "",
    position: "all",
    from: dataset.dates[0],
    to: dataset.dates[dataset.dates.length - 1],
  };
}

export function FilterRow({
  dataset,
  filters,
  matching,
  onChange,
}: FilterRowProps) {
  const defaults = defaultFilters(dataset);
  const isFiltered = (Object.keys(defaults) as (keyof Filters)[]).some(
    (key) => filters[key] !== defaults[key],
  );
  const playerOptions = [
    { value: "", label: "All players" },
    ...dataset.players.map((player) => ({
      value: String(player.id),
      label: player.name,
      detail: `${player.team} · ${POSITION_LABELS[player.position]}`,
    })),
  ];
  const teamOptions = [
    { value: "", label: "All teams" },
    ...dataset.teams.map((team) => ({ value: team, label: team })),
  ];

  return (
    <div className="filter-row">
      <DateRange
        dates={dataset.dates}
        from={filters.from}
        to={filters.to}
        onChange={(from, to) => onChange({ ...filters, from, to })}
      />
      <Dropdown
        label="Player"
        searchable
        options={playerOptions}
        value={filters.player}
        onChange={(player) => onChange({ ...filters, player })}
      />
      <Dropdown
        label="Team"
        searchable
        options={teamOptions}
        value={filters.team}
        onChange={(team) => onChange({ ...filters, team })}
      />
      <Segmented
        label="Position"
        value={filters.position}
        onChange={(position) => onChange({ ...filters, position })}
        options={[
          { value: "all", label: "All" },
          { value: "guard", label: "G" },
          { value: "forward", label: "F" },
          { value: "center", label: "C" },
        ]}
      />
      <div className="filter-count figure" aria-live="polite">
        n = {formatCount(matching)} games
      </div>
      {isFiltered && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(defaults)}
        >
          Reset
        </button>
      )}
    </div>
  );
}
