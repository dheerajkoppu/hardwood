import { scaleLinear } from "d3-scale";
import { useMemo } from "react";
import {
  COMPARED_MODELS,
  PREDICTOR_COLORS,
  PREDICTOR_LABELS,
  type Game,
  type ModelKey,
} from "../../data";
import { formatCount, formatPercent, formatSigned } from "../../format";
import {
  RESIDUAL_LIMIT,
  residualHistogram,
  summarize,
  type HistogramBin,
} from "../../statistics";
import {
  BottomAxis,
  HorizontalGrid,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  useElementWidth,
  useTooltip,
} from "./parts";

const HEIGHT = 190;
const MARGIN = { top: 10, right: 16, bottom: 24 };
const AXIS_WIDTH = 42;
const RESIDUAL_TICKS = [-40, -20, 0, 20, 40];

export function ResidualPanels({ games }: { games: Game[] }) {
  const histograms = useMemo(
    () =>
      COMPARED_MODELS.map((model) => ({
        model,
        bins: residualHistogram(games, model),
      })),
    [games],
  );
  const tallest = Math.max(
    1,
    ...histograms.flatMap(({ bins }) => bins.map((bin) => bin.games)),
  );

  return (
    <div>
      <div className="strip">
        {histograms.map(({ model, bins }, position) => (
          <ResidualPanel
            key={model}
            model={model}
            bins={bins}
            tallest={tallest}
            games={games}
            labelsCounts={position === 0}
          />
        ))}
      </div>
      <p className="strip-caption">
        Actual minus projected fantasy points. Right of zero, the player
        outscored the projection.
      </p>
    </div>
  );
}

interface ResidualPanelProps {
  model: ModelKey;
  bins: HistogramBin[];
  tallest: number;
  games: Game[];
  // The three panels share one count scale, so only the first prints it.
  labelsCounts: boolean;
}

function roundedColumn(
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const radius = Math.min(3, width / 2, height);
  return (
    `M${x},${y + height} V${y + radius} Q${x},${y} ${x + radius},${y} ` +
    `H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${y + height} Z`
  );
}

function ResidualPanel({
  model,
  bins,
  tallest,
  games,
  labelsCounts,
}: ResidualPanelProps) {
  const [container, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const summary = useMemo(() => summarize(games, model), [games, model]);
  const color = PREDICTOR_COLORS[model];
  const chartWidth = Math.max(160, width);

  const horizontal = scaleLinear()
    .domain([-RESIDUAL_LIMIT, RESIDUAL_LIMIT])
    .range([AXIS_WIDTH, chartWidth - MARGIN.right]);
  const vertical = scaleLinear()
    .domain([0, tallest])
    .nice(3)
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
  const floor = vertical(0);

  return (
    <figure className="panel">
      <figcaption className="panel-caption" style={{ paddingLeft: AXIS_WIDTH }}>
        <span className="panel-title">
          <span className="series-key" style={{ background: color }} />
          {PREDICTOR_LABELS[model]}
        </span>
        <span className="figure panel-stat">
          bias {formatSigned(summary.bias, 2)} · SD {summary.spread.toFixed(2)}
        </span>
      </figcaption>
      <div ref={container}>
        {width > 0 && (
          <svg
            width={chartWidth}
            height={HEIGHT}
            role="img"
            aria-label={`Distribution of ${PREDICTOR_LABELS[model]} errors`}
          >
            <HorizontalGrid
              scale={vertical}
              ticks={vertical.ticks(3)}
              start={AXIS_WIDTH}
              end={chartWidth - MARGIN.right}
              format={labelsCounts ? formatCount : () => ""}
              emphasized={0}
            />
            <BottomAxis
              scale={horizontal}
              ticks={RESIDUAL_TICKS}
              start={floor}
              format={(tick) => formatSigned(tick, 0)}
            />
            {bins.map((bin) => {
              const left = horizontal(bin.start) + 1;
              const columnWidth =
                horizontal(bin.end) - horizontal(bin.start) - 2;
              const top = vertical(bin.games);
              return (
                <g key={bin.start}>
                  {bin.games > 0 && (
                    <path
                      d={roundedColumn(left, top, columnWidth, floor - top)}
                      fill={color}
                    />
                  )}
                  <rect
                    x={horizontal(bin.start)}
                    y={MARGIN.top}
                    width={horizontal(bin.end) - horizontal(bin.start)}
                    height={floor - MARGIN.top}
                    className="chart-hit"
                    onPointerMove={(event) =>
                      show(
                        event,
                        <>
                          <TooltipTitle>
                            Missed by {formatSigned(bin.start, 1)} to{" "}
                            {formatSigned(bin.end, 1)} FP
                          </TooltipTitle>
                          <TooltipRow
                            color={color}
                            label="games"
                            value={formatCount(bin.games)}
                          />
                          <TooltipRow
                            label="of all games"
                            value={formatPercent(bin.games / games.length, 1)}
                          />
                        </>,
                      )
                    }
                    onPointerLeave={hide}
                  />
                </g>
              );
            })}
            <line
              x1={horizontal(0)}
              x2={horizontal(0)}
              y1={MARGIN.top}
              y2={floor}
              className="chart-reference"
            />
          </svg>
        )}
      </div>
      <Tooltip tooltip={tooltip} />
    </figure>
  );
}
