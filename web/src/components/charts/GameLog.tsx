import { scaleLinear } from "d3-scale";
import { area as createArea, line as createLine } from "d3-shape";
import { useState } from "react";
import {
  PREDICTOR_COLORS,
  PREDICTOR_LABELS,
  type Game,
  type ModelKey,
} from "../../data";
import { formatNumber, formatShortDate, formatSigned } from "../../format";
import {
  AxisTitle,
  HorizontalGrid,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  useElementWidth,
  useTooltip,
} from "./parts";

const HEIGHT = 320;
const MARGIN = { top: 12, right: 16, bottom: 34, left: 46 };
const MONTH_LABEL_WIDTH = 30;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface GameLogProps {
  games: Game[];
  shownModels: ModelKey[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function GameLog({
  games,
  shownModels,
  selectedDate,
  onSelect,
}: GameLogProps) {
  const [container, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const [hovered, setHovered] = useState<number | null>(null);

  const chartWidth = Math.max(300, width);
  const horizontal = scaleLinear()
    .domain([0, Math.max(1, games.length - 1)])
    .range([MARGIN.left + 8, chartWidth - MARGIN.right - 8]);
  const vertical = scaleLinear()
    .domain([
      0,
      Math.max(...games.map((game) => Math.max(game.ceiling, game.actual))),
    ])
    .nice(5)
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

  const positions = games.map((_, position) => position);
  const band = createArea<number>()
    .x((position) => horizontal(position))
    .y0((position) => vertical(Math.max(0, games[position].floor)))
    .y1((position) => vertical(games[position].ceiling));
  const pathFor = (model: ModelKey) =>
    createLine<number>()
      .x((position) => horizontal(position))
      .y((position) => vertical(games[position].predicted[model]))(positions) ??
    undefined;

  const firstGamesOfMonth = positions.filter(
    (position) =>
      position === 0 ||
      games[position].date.slice(0, 7) !== games[position - 1].date.slice(0, 7),
  );
  // A month with only a game or two would print its label on top of the next one.
  const monthStarts = firstGamesOfMonth.filter((position, order) => {
    const next = firstGamesOfMonth[order + 1];
    return (
      next === undefined ||
      horizontal(next) - horizontal(position) >= MONTH_LABEL_WIDTH
    );
  });
  const selected = games.findIndex((game) => game.date === selectedDate);

  const nearestPosition = (event: React.MouseEvent<SVGRectElement>) => {
    const pointerX =
      event.clientX -
      event.currentTarget.ownerSVGElement!.getBoundingClientRect().left;
    return Math.min(
      games.length - 1,
      Math.max(0, Math.round(horizontal.invert(pointerX))),
    );
  };

  const handlePointer = (event: React.PointerEvent<SVGRectElement>) => {
    const position = nearestPosition(event);
    const game = games[position];
    setHovered(position);
    show(
      event,
      <>
        <TooltipTitle detail={`${game.isHome ? "vs" : "@"} ${game.opponent}`}>
          {formatShortDate(game.date)}
        </TooltipTitle>
        <TooltipRow
          color="var(--ink)"
          label="Actual"
          value={formatNumber(game.actual)}
        />
        {(["ensemble", "xgboost", "random_forest"] as ModelKey[]).map(
          (model) => (
            <TooltipRow
              key={model}
              color={PREDICTOR_COLORS[model]}
              label={
                model === "ensemble"
                  ? "Final projection"
                  : PREDICTOR_LABELS[model]
              }
              value={formatNumber(game.predicted[model])}
            />
          ),
        )}
        <TooltipRow
          label="Floor to ceiling"
          value={`${formatNumber(Math.max(0, game.floor))} to ${formatNumber(game.ceiling)}`}
        />
        <TooltipRow
          label="Miss"
          value={formatSigned(game.actual - game.predicted.ensemble)}
        />
      </>,
    );
  };

  const handleKeys = (event: React.KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0 || selected < 0) return;
    event.preventDefault();
    onSelect(
      games[Math.min(games.length - 1, Math.max(0, selected + step))].date,
    );
  };

  return (
    <figure className="panel">
      <div ref={container}>
        {width > 0 && (
          <svg
            width={chartWidth}
            height={HEIGHT}
            role="img"
            tabIndex={0}
            onKeyDown={handleKeys}
            aria-label="Projected and actual fantasy points for each game. Use the left and right arrow keys to move between games."
          >
            <HorizontalGrid
              scale={vertical}
              ticks={vertical.ticks(5)}
              start={MARGIN.left}
              end={chartWidth - MARGIN.right}
              emphasized={0}
            />
            {monthStarts.map((position) => (
              <text
                key={position}
                x={horizontal(position)}
                y={HEIGHT - MARGIN.bottom + 18}
                className="chart-tick"
              >
                {MONTHS[Number(games[position].date.slice(5, 7)) - 1]}
              </text>
            ))}
            <AxisTitle
              x={11}
              y={(MARGIN.top + HEIGHT - MARGIN.bottom) / 2}
              rotate
            >
              Fantasy points
            </AxisTitle>

            <path d={band(positions) ?? undefined} className="chart-band" />
            {shownModels
              .filter((model) => model !== "ensemble")
              .map((model) => (
                <path
                  key={model}
                  d={pathFor(model)}
                  stroke={PREDICTOR_COLORS[model]}
                  className="chart-line"
                />
              ))}
            <path
              d={pathFor("ensemble")}
              stroke={PREDICTOR_COLORS.ensemble}
              className="chart-line"
            />

            {selected >= 0 && (
              <line
                x1={horizontal(selected)}
                x2={horizontal(selected)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                className="chart-selection"
              />
            )}
            {hovered !== null && hovered !== selected && (
              <line
                x1={horizontal(hovered)}
                x2={horizontal(hovered)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                className="chart-crosshair"
              />
            )}
            {games.map((game, position) => (
              <circle
                key={game.date}
                cx={horizontal(position)}
                cy={vertical(game.actual)}
                r={position === selected || position === hovered ? 5.5 : 3.5}
                className="chart-dot chart-dot-actual"
              />
            ))}
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={chartWidth - MARGIN.left - MARGIN.right}
              height={HEIGHT - MARGIN.top - MARGIN.bottom}
              className="chart-hit"
              style={{ cursor: "pointer" }}
              onPointerMove={handlePointer}
              onPointerLeave={() => {
                setHovered(null);
                hide();
              }}
              onClick={(event) => onSelect(games[nearestPosition(event)].date)}
            />
          </svg>
        )}
      </div>
      <Tooltip tooltip={tooltip} />
    </figure>
  );
}
