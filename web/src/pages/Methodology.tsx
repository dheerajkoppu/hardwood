import { PREDICTOR_LABELS, type Dataset } from "../data";
import { formatCount, formatNumber, formatPercent } from "../format";
import { linkTo } from "../router";

const WEIGHT_LABELS: Record<string, string> = {
  points: "Point",
  three_pointers_made: "Three-pointer made",
  rebounds: "Rebound",
  assists: "Assist",
  steals: "Steal",
  blocks: "Block",
  turnovers: "Turnover",
};

export function Methodology({ dataset }: { dataset: Dataset }) {
  const { metrics } = dataset;
  const { data, intervals, hyperparameters, ensemble } = metrics;
  const groups = [...new Set(metrics.features.map((feature) => feature.group))];
  const scoreOf = (key: string) =>
    metrics.leaderboard.find((entry) => entry.key === key)!.test;
  const seasonRoles = data.seasons.map((season) => ({
    season,
    role: data.train_seasons.includes(season)
      ? "train"
      : season === data.validation_season
        ? "validation"
        : "test",
  }));

  return (
    <div className="page prose">
      <h1 className="page-title">Methodology</h1>
      <p className="page-lede">
        How the projections are made, how they were tested, and what they cannot
        see. Every figure on this page is read from the training run's output.
      </p>

      <section className="section">
        <h2 className="section-title">The question</h2>
        <p className="finding">
          Before tip-off, how many DraftKings fantasy points will this player
          score tonight?
        </p>
        <div className="scroll-x">
          <table className="data-table scoring-table">
            <thead>
              <tr>
                <th>Stat</th>
                <th className="is-number">Fantasy points</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.scoring.weights).map(([stat, weight]) => (
                <tr key={stat}>
                  <td>{WEIGHT_LABELS[stat] ?? stat}</td>
                  <td className="is-number">
                    {weight > 0 ? `+${weight}` : `−${Math.abs(weight)}`}
                  </td>
                </tr>
              ))}
              <tr>
                <td>Double-double</td>
                <td className="is-number">
                  +{metrics.scoring.double_double_bonus}
                </td>
              </tr>
              <tr>
                <td>Triple-double (on top of the double-double)</td>
                <td className="is-number">
                  +{metrics.scoring.triple_double_bonus}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Data and split</h2>
        <p>
          {formatCount(data.player_games)} player-games from{" "}
          {data.seasons.length} regular seasons, pulled from stats.nba.com.
          Seasons are split by time and never shuffled: a random split would let
          the model learn from games played after the ones it is tested on.
        </p>
        <div
          className="timeline"
          role="img"
          aria-label={`Training seasons ${data.train_seasons.join(", ")}; validation season ${data.validation_season}; test season ${data.test_season}`}
        >
          {seasonRoles.map(({ season, role }) => (
            <div key={season} className={`timeline-season is-${role}`}>
              <span className="figure">{season}</span>
              <span className="label">{role}</span>
            </div>
          ))}
        </div>
        <ul>
          <li>
            <strong>Train</strong> ({formatCount(data.train_rows)} games):
            models learn here.
          </li>
          <li>
            <strong>Validation</strong> ({formatCount(data.validation_rows)}{" "}
            games): picks hyperparameters, the ensemble weights, and the width
            of the projected range.
          </li>
          <li>
            <strong>Test</strong> ({formatCount(data.test_rows)} games,{" "}
            {data.test_players} players): touched once, to produce the numbers
            in this app. Final models are refit on train plus validation with
            the settings already chosen.
          </li>
        </ul>
        <p className="note">
          A player needs {data.minimum_prior_games} earlier games before any
          model or baseline scores them, so every method is judged on the same
          rows.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">No peeking</h2>
        <p>
          Every feature is built only from games that finished before the one
          being projected. Rolling averages are shifted by one game; team and
          opponent ratings are season-to-date as of that morning. Minutes,
          usage, and shooting from the game itself are never inputs.
        </p>
        <p>
          This is enforced by a test: it rewrites every box score from a cutoff
          date onward with random numbers, rebuilds the features, and requires
          that the cutoff day's features come out identical. If any feature read
          the game it was predicting, the test would fail.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">{metrics.features.length} features</h2>
        <div className="feature-groups">
          {groups.map((group) => (
            <div key={group}>
              <h3>{group}</h3>
              <ul>
                {metrics.features
                  .filter((feature) => feature.group === group)
                  .map((feature) => (
                    <li key={feature.key}>{feature.label}</li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="note">
          Usage, assist, and rebound rates are computed from box scores with the
          standard formulas. Injury features count rotation players (at least 3
          appearances in the team's last 10 games, averaging 15+ minutes) who
          sat out, and the minutes and possessions they usually take.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">Models</h2>
        <ul>
          <li>
            <strong>Baselines.</strong> Season average, last-10 average, last-5
            average. A model has to beat these to justify existing. The best was
            the {PREDICTOR_LABELS[metrics.best_baseline].toLowerCase()} at{" "}
            {formatNumber(scoreOf(metrics.best_baseline).mae, 2)} FP.
          </li>
          <li>
            <strong>Ridge regression.</strong> A linear reference point (alpha{" "}
            {hyperparameters.ridge.alpha}). It reached{" "}
            {formatNumber(scoreOf("ridge").mae, 2)} FP, capturing{" "}
            {formatPercent(
              (scoreOf(metrics.best_baseline).mae - scoreOf("ridge").mae) /
                (scoreOf(metrics.best_baseline).mae - scoreOf("ensemble").mae),
            )}{" "}
            of the ensemble's gain over the baseline with no non-linear
            modeling at all.
          </li>
          <li>
            <strong>Random Forest.</strong>{" "}
            {hyperparameters.random_forest.trees} trees, minimum{" "}
            {hyperparameters.random_forest.min_samples_leaf} games per leaf,{" "}
            {formatPercent(hyperparameters.random_forest.max_features)} of
            features tried per split.
          </li>
          <li>
            <strong>XGBoost.</strong> Tuned with{" "}
            {hyperparameters.xgboost.trials} Optuna trials scored by
            walk-forward validation (train on earlier seasons, check on the next
            one). Chosen settings: depth {hyperparameters.xgboost.max_depth},
            learning rate{" "}
            {formatNumber(hyperparameters.xgboost.learning_rate, 3)},{" "}
            {hyperparameters.xgboost.boosting_rounds} rounds.
          </li>
          <li>
            <strong>Ensemble.</strong>{" "}
            {formatNumber(ensemble.xgboost_weight, 2)} × XGBoost +{" "}
            {formatNumber(ensemble.random_forest_weight, 2)} × Random Forest.
            The weight was chosen to minimize error on the validation season.
          </li>
        </ul>
      </section>

      <section className="section">
        <h2 className="section-title">Floor and ceiling</h2>
        <p>
          Three more XGBoost models predict the 10th, 50th, and 90th percentile
          of a player's night. The 10th-to-90th band is then widened by a fixed
          amount learned on the validation season (conformalized quantile
          regression) so that it holds about{" "}
          {formatPercent(intervals.nominal_coverage)} of results on data it has
          not seen.
        </p>
        <p>
          On the test season the band held{" "}
          {formatPercent(intervals.calibrated_coverage, 1)} of results (
          {formatPercent(intervals.raw_coverage, 1)} before the adjustment of{" "}
          {formatNumber(intervals.conformal_adjustment, 2)} FP) and is{" "}
          {formatNumber(intervals.average_width)} FP wide on average.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">What the model cannot see</h2>
        <ul>
          <li>
            <strong>Late news.</strong> Absent teammates are read from who
            actually played, which stands in for the pre-game injury report. A
            real-time version would not know about scratches announced minutes
            before tip.
          </li>
          <li>
            <strong>Starting lineups.</strong> The game-log feed used here does
            not mark starters, so the model uses a proxy: whether a player was
            in their team's top five by minutes in recent games.
          </li>
          <li>
            <strong>Betting markets.</strong> Point spreads and totals carry
            information about pace and blowouts that would likely help. They are
            not included.
          </li>
          <li>
            <strong>Whether a player plays at all.</strong> Projections are
            conditional on the player appearing in the game.
          </li>
          <li>
            <strong>New situations.</strong> Rookies, trades, and returns from
            long injuries have little relevant history in the first few games.
          </li>
          <li>
            <strong>Model drift.</strong> The models were trained once and not
            updated during the test season; a live system would retrain as the
            season goes.
          </li>
        </ul>
        <p>
          See all of it tested in the <a href={linkTo("/lab")}>Model Lab</a>.
        </p>
      </section>
    </div>
  );
}
