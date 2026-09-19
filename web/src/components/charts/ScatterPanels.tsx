import { hexbin as createHexbin } from "d3-hexbin";
import { scaleLinear, scaleSqrt } from "d3-scale";
import { useMemo, useState } from "react";
import {
  COMPARED_MODELS,
  PREDICTOR_COLORS,
  PREDICTOR_LABELS,
  type Game,
  type ModelKey,
  type Player,
} from "../../data";
import {
  formatCount,
  formatNumber,
  formatShortDate,
  formatSigned,
} from "../../format";
import { navigate } from "../../router";
import { summarize } from "../../statistics";
import {
  AxisTitle,
  BottomAxis,
  HorizontalGrid,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  useElementWidth,
  useTooltip,
} from "./parts";

export const DENSITY_THRESHOLD = 600;
const HOVER_REACH = 24;

// The ensemble is the projection the app shows, so it leads; the two models it blends sit beside it.
const SUPPORTING_MODELS: ModelKey[] = ["xgboost", "random_forest"];

const PANEL_GEOMETRY = {
  lead: {
    margin: { top: 10, right: 12, bottom: 42, left: 46 },
    hexagonRadius: 7,
    tickCount: 6,
  },
  support: {
    margin: { top: 8, right: 8, bottom: 24, left: 32 },
    hexagonRadius: 5,
    tickCount: 3,
  },
};

interface ScatterPanelsProps {
  games: Game[];
  playersById: Map<number, Player>;
}

export function ScatterPanels({ games, playersById }: ScatterPanelsProps) {
  const maximum = useMemo(() => {
    let largest = 20;
    for (const game of games) {
      largest = Math.max(
        largest,
        game.actual,
        ...COMPARED_MODELS.map((model) => game.predicted[model]),
      );
    }
    return Math.ceil(largest / 10) * 10;
  }, [games]);

  return (
    <div className="scatter-figure">
      <ScatterPanel
        model="ensemble"
        role="lead"
        games={games}
        maximum={maximum}
        playersById={playersById}
      />
      <div className="scatter-support">
        {SUPPORTING_MODELS.map((model) => (
          <ScatterPanel
            key={model}
            model={model}
            role="support"
            games={games}
            maximum={maximum}
            playersById={playersById}
          />
        ))}
      </div>
    </div>
  );
}

interface ScatterPanelProps extends ScatterPanelsProps {
  model: ModelKey;
  role: keyof typeof PANEL_GEOMETRY;
  maximum: number;
}

function ScatterPanel({
  model,
  role,
  games,
  maximum,
  playersById,
}: ScatterPanelProps) {
  const [container, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const [hovered, setHovered] = useState<Game | null>(null);
  const summary = useMemo(() => summarize(games, model), [games, model]);
  const { margin, hexagonRadius, tickCount } = PANEL_GEOMETRY[role];
  const color = PREDICTOR_COLORS[model];
  const isDense = games.length > DENSITY_THRESHOLD;
  const isLead = role === "lead";

  const size = Math.max(160, width);
  const horizontal = useMemo(
    () =>
      scaleLinear()
        .domain([0, maximum])
        .range([margin.left, size - margin.right]),
    [maximum, size, margin],
  );
  const vertical = useMemo(
    () =>
      scaleLinear()
        .domain([0, maximum])
        .range([size - margin.bottom, margin.top]),
    [maximum, size, margin],
  );
  const ticks = horizontal.ticks(tickCount);

  const hexagons = useMemo(() => {
    if (!isDense) return null;
    const layout = createHexbin<Game>()
      .x((game) => horizontal(Math.max(0, game.predicted[model])))
      .y((game) => vertical(Math.max(0, game.actual)))
      .radius(hexagonRadius)
      .extent([
        [margin.left, margin.top],
        [size - margin.right, size - margin.bottom],
      ]);
    const bins = layout(games);
    const opacity = scaleSqrt()
      .domain([1, Math.max(2, ...bins.map((bin) => bin.length))])
      .range([0.1, 1]);
    return { bins, opacity, outline: layout.hexagon() };
  }, [
    games,
    horizontal,
    vertical,
    isDense,
    model,
    size,
    margin,
    hexagonRadius,
  ]);

  const findNearest = (event: React.PointerEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    let nearest: Game | null = null;
    let nearestDistance = HOVER_REACH;
    for (const game of games) {
      const distance = Math.hypot(
        horizontal(game.predicted[model]) - pointerX,
        vertical(game.actual) - pointerY,
      );
      if (distance < nearestDistance) {
        nearest = game;
        nearestDistance = distance;
      }
    }
    setHovered(nearest);
    if (!nearest) return hide();
    show(
      event,
      <>
        <TooltipTitle
          detail={`${formatShortDate(nearest.date)} ${nearest.isHome ? "vs" : "@"} ${nearest.opponent}`}
        >
          {playersById.get(nearest.playerId)?.name ?? "Unknown player"}
        </TooltipTitle>
        <TooltipRow
          color={color}
          label={`${PREDICTOR_LABELS[model]} projection`}
          value={formatNumber(nearest.predicted[model])}
        />
        <TooltipRow
          color="var(--ink)"
          label="Actual"
          value={formatNumber(nearest.actual)}
        />
        <TooltipRow
          label="Miss"
          value={formatSigned(nearest.actual - nearest.predicted[model])}
        />
      </>,
    );
  };

  return (
    <figure className="panel">
      <figcaption className="panel-caption">
        <span className="panel-title">
          <span className="series-key" style={{ background: color }} />
          {PREDICTOR_LABELS[model]}
        </span>
        <span className="figure panel-stat">
          MAE {formatNumber(summary.mae, 2)} · R² {formatNumber(summary.r2, 2)}
        </span>
      </figcaption>
      <div ref={container}>
        {width > 0 && (
          <svg
            width={size}
            height={size}
            role="img"
            aria-label={`${PREDICTOR_LABELS[model]} projections against actual fantasy points for ${formatCount(games.length)} games`}
          >
            <HorizontalGrid
              scale={vertical}
              ticks={ticks}
              start={margin.left}
              end={size - margin.right}
              emphasized={0}
            />
            <BottomAxis
              scale={horizontal}
              ticks={ticks}
              start={size - margin.bottom}
            />
            {isLead && (
              <>
                <AxisTitle
                  x={(margin.left + size - margin.right) / 2}
                  y={size - 4}
                >
                  Projected fantasy points
                </AxisTitle>
                <AxisTitle
                  x={11}
                  y={(margin.top + size - margin.bottom) / 2}
                  rotate
                >
                  Actual fantasy points
                </AxisTitle>
              </>
            )}

            {hexagons?.bins.map((bin) => (
              <path
                key={`${bin.x},${bin.y}`}
                d={hexagons.outline}
                transform={`translate(${bin.x}, ${bin.y})`}
                fill={color}
                fillOpacity={hexagons.opacity(bin.length)}
                className="hexagon"
                onPointerMove={(event) =>
                  show(
                    event,
                    <>
                      <TooltipTitle>
                        {formatCount(bin.length)} games
                      </TooltipTitle>
                      <TooltipRow
                        color={color}
                        label="Projected, about"
                        value={formatNumber(horizontal.invert(bin.x), 0)}
                      />
                      <TooltipRow
                        color="var(--ink)"
                        label="Actual, about"
                        value={formatNumber(vertical.invert(bin.y), 0)}
                      />
                    </>,
                  )
                }
                onPointerLeave={hide}
              />
            ))}

            <line
              x1={horizontal(0)}
              y1={vertical(0)}
              x2={horizontal(maximum)}
              y2={vertical(maximum)}
              className="chart-reference"
            />
            {isLead && (
              <text
                x={horizontal(maximum) - 28}
                y={vertical(maximum) + 12}
                textAnchor="end"
                className="chart-annotation"
              >
                a perfect call lands on this line
              </text>
            )}

            {!isDense &&
              games.map((game) => (
                <circle
                  key={`${game.playerId}-${game.date}`}
                  cx={horizontal(game.predicted[model])}
                  cy={vertical(game.actual)}
                  r={game === hovered ? 6 : isLead ? 4 : 3}
                  fill={color}
                  className="chart-dot"
                />
              ))}
            {!isDense && (
              <rect
                x={margin.left}
                y={margin.top}
                width={size - margin.left - margin.right}
                height={size - margin.top - margin.bottom}
                fill="transparent"
                style={{ cursor: hovered ? "pointer" : "default" }}
                onPointerMove={findNearest}
                onPointerLeave={() => {
                  setHovered(null);
                  hide();
                }}
                onClick={() =>
                  hovered &&
                  navigate(`/players/${hovered.playerId}`, {
                    date: hovered.date,
                  })
                }
              />
            )}
          </svg>
        )}
      </div>
      <Tooltip tooltip={tooltip} />
    </figure>
  );
}
