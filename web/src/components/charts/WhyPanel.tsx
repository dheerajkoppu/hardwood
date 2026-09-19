import type { Explanation, FeatureDescription } from "../../data";
import { formatFeatureValue, formatNumber, formatSigned } from "../../format";

interface WhyPanelProps {
  explanation: Explanation | null;
  date: string;
  features: FeatureDescription[];
}

export function WhyPanel({ explanation, date, features }: WhyPanelProps) {
  if (!explanation)
    return (
      <p className="note pending">
        Loading the model's reasoning for this game.
      </p>
    );
  const game = explanation.games[date];
  if (!game)
    return <p className="note">No explanation was saved for this game.</p>;

  const rows = [
    ...game.contributions.map(([featureIndex, contribution, featureValue]) => ({
      key: features[featureIndex].key,
      label: features[featureIndex].label,
      detail: formatFeatureValue(features[featureIndex].key, featureValue),
      contribution,
    })),
    {
      key: "remainder",
      label: "All other features",
      detail: "",
      contribution: game.remainder,
    },
  ];
  const reach = Math.max(0.5, ...rows.map((row) => Math.abs(row.contribution)));
  const projection =
    explanation.base_value +
    rows.reduce((total, row) => total + row.contribution, 0);

  return (
    <div className="why">
      <div className="why-anchor">
        <span>Average player-game</span>
        <span className="figure">
          {formatNumber(explanation.base_value)} FP
        </span>
      </div>
      <ol className="why-rows">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="why-label">
              {row.label}
              {row.detail && <span className="why-detail">{row.detail}</span>}
            </span>
            <span className="why-track" aria-hidden="true">
              <span className="why-zero" />
              <span
                className={
                  row.contribution >= 0
                    ? "why-fill is-raise"
                    : "why-fill is-lower"
                }
                style={{
                  width: `${(50 * Math.abs(row.contribution)) / reach}%`,
                }}
              />
            </span>
            <span className="why-value figure">
              {formatSigned(row.contribution, 1)}
            </span>
          </li>
        ))}
      </ol>
      <div className="why-anchor is-total">
        <span>XGBoost projection</span>
        <span className="figure">{formatNumber(projection)} FP</span>
      </div>
      <div className="why-key">
        <span>
          <i style={{ background: "var(--raises)" }} />
          Raises the projection
        </span>
        <span>
          <i style={{ background: "var(--lowers)" }} />
          Lowers the projection
        </span>
      </div>
    </div>
  );
}
