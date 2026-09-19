import type { FeatureDescription, Importance } from "../../data";
import { formatNumber, formatPercent } from "../../format";

export type Measure = keyof Importance;

interface MeasureDescription {
  label: string;
  model: string;
  color: string;
  explanation: string;
  format: (value: number) => string;
}

export const MEASURES: Record<Measure, MeasureDescription> = {
  shap: {
    label: "SHAP",
    model: "XGBoost",
    color: "var(--xgboost)",
    explanation:
      "Average fantasy points this input moves a single projection, up or down.",
    format: (value) => `${formatNumber(value, 2)} FP`,
  },
  xgboost_gain: {
    label: "Gain",
    model: "XGBoost",
    color: "var(--xgboost)",
    explanation:
      "Share of the total error reduction earned by splits on this input.",
    format: (value) => formatPercent(value, 1),
  },
  random_forest_permutation: {
    label: "Permutation",
    model: "Random Forest",
    color: "var(--forest)",
    explanation:
      "How much the average miss grows on the test season when this input is shuffled.",
    format: (value) => `+${formatNumber(value, 2)} FP`,
  },
  random_forest_impurity: {
    label: "Impurity",
    model: "Random Forest",
    color: "var(--forest)",
    explanation:
      "Share of variance reduction across the forest's splits. Known to favor continuous inputs; shown for comparison.",
    format: (value) => formatPercent(value, 1),
  },
};

const SHARE_MEASURES: Measure[] = ["xgboost_gain", "random_forest_impurity"];
const SHOWN = 15;

export function rankFeatures(
  importance: Importance,
  features: FeatureDescription[],
  measure: Measure,
) {
  const total = importance[measure].reduce((sum, value) => sum + value, 0);
  return features
    .map((feature, position) => ({
      feature,
      value: SHARE_MEASURES.includes(measure)
        ? importance[measure][position] / total
        : importance[measure][position],
    }))
    .sort((first, second) => second.value - first.value);
}

interface MeasurePickerProps {
  measure: Measure;
  onChange: (measure: Measure) => void;
}

export function MeasurePicker({ measure, onChange }: MeasurePickerProps) {
  return (
    <div
      className="measure-picker"
      role="radiogroup"
      aria-label="Importance measure"
    >
      {(Object.keys(MEASURES) as Measure[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={key === measure}
          onClick={() => onChange(key)}
        >
          <span className="radio-mark" />
          <span className="measure-name">{MEASURES[key].label}</span>
          <span className="measure-model">{MEASURES[key].model}</span>
        </button>
      ))}
      <p className="note">{MEASURES[measure].explanation}</p>
    </div>
  );
}

interface ImportanceBarsProps {
  importance: Importance;
  features: FeatureDescription[];
  measure: Measure;
}

export function ImportanceBars({
  importance,
  features,
  measure,
}: ImportanceBarsProps) {
  const description = MEASURES[measure];
  const ranked = rankFeatures(importance, features, measure).slice(0, SHOWN);
  const largest = ranked[0].value;

  return (
    <ol className="bar-list">
      {ranked.map(({ feature, value }) => (
        <li key={feature.key}>
          <span className="bar-list-label">
            {feature.label}
            <span className="tag">{feature.group}</span>
          </span>
          <span className="bar-list-track">
            <span
              className="bar-list-fill"
              style={{
                width: `${Math.max(0.5, (100 * value) / largest)}%`,
                background: description.color,
              }}
            />
          </span>
          <span className="bar-list-value figure">
            {description.format(value)}
          </span>
        </li>
      ))}
    </ol>
  );
}
