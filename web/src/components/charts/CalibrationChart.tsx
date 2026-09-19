import { scaleLinear } from "d3-scale";
import { line as createLine } from "d3-shape";
import { useMemo, useState } from "react";
import {
  COMPARED_MODELS,
  PREDICTOR_COLORS,
  PREDICTOR_LABELS,
  type Game,
} from "../../data";
import { formatNumber, formatPercent, formatSigned } from "../../format";
import {
  averageBandWidth,
  calibrationBuckets,
  coverage,
  type CalibrationBucket,
} from "../../statistics";
import {
  AxisTitle,
  BottomAxis,
  HorizontalGrid,
  Legend,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  useElementWidth,
  useTooltip,
} from "./parts";

const HEIGHT = 300;
const MARGIN = { top: 16, right: 16, bottom: 40, left: 58 };

export function CalibrationChart({ games }: { games: Game[] }) {
  const [container, width] = useElementWidth<HTMLDivElement>();
  const { tooltip, show, hide } = useTooltip();
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);

  const series = useMemo(
    () =>
      COMPARED_MODELS.map((model) => ({
        model,
        buckets: calibrationBuckets(games, model),
      })),
    [games],
  );
  const allBuckets = series.flatMap(({ buckets }) => buckets);
  if (allBuckets.length === 0) {
    return (
      <p className="note">
        Calibration needs at least 20 games. Widen the filters to see it.
      </p>
    );
  }

  const deviation = (bucket: CalibrationBucket) =>
    bucket.actualMean - bucket.predictedMean;
  const largestDeviation = Math.max(
    1,
    Math.ceil(
      Math.max(...allBuckets.map((bucket) => Math.abs(deviation(bucket)))),
    ),
  );
  const chartWidth = Math.max(280, width);
  const horizontal = scaleLinear()
    .domain([0, Math.max(...allBuckets.map((bucket) => bucket.predictedMean))])
    .nice()
    .range([MARGIN.left, chartWidth - MARGIN.right]);
  const vertical = scaleLinear()
    .domain([-largestDeviation, largestDeviation])
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
  const path = createLine<CalibrationBucket>()
    .x((bucket) => horizontal(bucket.predictedMean))
    .y((bucket) => vertical(deviation(bucket)));

  const ensembleBuckets = series[series.length - 1].buckets;
  const handlePointer = (event: React.PointerEvent<SVGRectElement>) => {
    const pointerX =
      event.clientX -
      event.currentTarget.ownerSVGElement!.getBoundingClientRect().left;
    let nearest = ensembleBuckets[0];
    for (const bucket of ensembleBuckets) {
      if (
        Math.abs(horizontal(bucket.predictedMean) - pointerX) <
        Math.abs(horizontal(nearest.predictedMean) - pointerX)
      ) {
        nearest = bucket;
      }
    }
    setHoveredBucket(nearest.bucket);
    show(
      event,
      <>
        <TooltipTitle detail={`${nearest.games} games per model`}>
          Projection group {nearest.bucket} of {ensembleBuckets.length}
        </TooltipTitle>
        {series.map(({ model, buckets }) => {
          const bucket = buckets[nearest.bucket - 1];
          return (
            <TooltipRow
              key={model}
              color={PREDICTOR_COLORS[model]}
              label={`${PREDICTOR_LABELS[model]}: projected ${formatNumber(bucket.predictedMean)}, scored ${formatNumber(bucket.actualMean)}`}
              value={formatSigned(deviation(bucket), 2)}
            />
          );
        })}
      </>,
    );
  };
  const crosshair = ensembleBuckets.find(
    (bucket) => bucket.bucket === hoveredBucket,
  );

  return (
    <figure className="panel">
      <Legend
        items={COMPARED_MODELS.map((model) => ({
          label: PREDICTOR_LABELS[model],
          color: PREDICTOR_COLORS[model],
        }))}
      />
      <div ref={container}>
        {width > 0 && (
          <svg
            width={chartWidth}
            height={HEIGHT}
            role="img"
            aria-label="Calibration: how far actual scoring sits from projected scoring, by projection level"
          >
            <HorizontalGrid
              scale={vertical}
              ticks={vertical.ticks(5)}
              start={MARGIN.left}
              end={chartWidth - MARGIN.right}
              format={(tick) => formatSigned(tick, 1)}
              emphasized={0}
            />
            <BottomAxis
              scale={horizontal}
              ticks={horizontal.ticks(6)}
              start={HEIGHT - MARGIN.bottom}
            />
            <AxisTitle
              x={(MARGIN.left + chartWidth - MARGIN.right) / 2}
              y={HEIGHT - 4}
            >
              Average projection in group (FP)
            </AxisTitle>
            <AxisTitle
              x={11}
              y={(MARGIN.top + HEIGHT - MARGIN.bottom) / 2}
              rotate
            >
              Actual minus projected
            </AxisTitle>
            <text
              x={chartWidth - MARGIN.right}
              y={MARGIN.top + 4}
              textAnchor="end"
              className="chart-annotation"
            >
              scored more than projected ↑
            </text>
            <text
              x={chartWidth - MARGIN.right}
              y={HEIGHT - MARGIN.bottom - 8}
              textAnchor="end"
              className="chart-annotation"
            >
              scored less than projected ↓
            </text>
            {crosshair && (
              <line
                x1={horizontal(crosshair.predictedMean)}
                x2={horizontal(crosshair.predictedMean)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                className="chart-crosshair"
              />
            )}
            {series.map(({ model, buckets }) => (
              <g key={model}>
                <path
                  d={path(buckets) ?? undefined}
                  stroke={PREDICTOR_COLORS[model]}
                  className="chart-line"
                />
                {buckets.map((bucket) => (
                  <circle
                    key={bucket.bucket}
                    cx={horizontal(bucket.predictedMean)}
                    cy={vertical(deviation(bucket))}
                    r={4}
                    fill={PREDICTOR_COLORS[model]}
                    className="chart-dot"
                  />
                ))}
              </g>
            ))}
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={chartWidth - MARGIN.left - MARGIN.right}
              height={HEIGHT - MARGIN.top - MARGIN.bottom}
              className="chart-hit"
              onPointerMove={handlePointer}
              onPointerLeave={() => {
                setHoveredBucket(null);
                hide();
              }}
            />
          </svg>
        )}
      </div>
      <Tooltip tooltip={tooltip} />
    </figure>
  );
}

export function CoverageMeter({
  games,
  target,
}: {
  games: Game[];
  target: number;
}) {
  const share = coverage(games);
  return (
    <div className="coverage">
      <div>
        <div className="label">Floor-to-ceiling range</div>
        <div className="coverage-value">{formatPercent(share, 1)}</div>
      </div>
      <div className="coverage-detail">
        <p className="coverage-caption">
          of results landed inside the projected range. The target is{" "}
          {formatPercent(target)}.
        </p>
        <div
          className="meter"
          role="img"
          aria-label={`${formatPercent(share, 1)} coverage against a ${formatPercent(target)} target`}
        >
          <div
            className="meter-fill"
            style={{ width: `${Math.min(100, 100 * share)}%` }}
          />
          <div className="meter-target" style={{ left: `${100 * target}%` }}>
            <span>target</span>
          </div>
        </div>
        <p className="note">
          The range is {formatNumber(averageBandWidth(games))} FP wide on
          average. Too narrow and it would catch fewer than{" "}
          {formatPercent(target)}; too wide and it would catch more.
        </p>
      </div>
    </div>
  );
}
