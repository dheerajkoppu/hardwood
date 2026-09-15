import json
import math
import shutil
from datetime import datetime, timezone

import numpy as np
import optuna
import pandas as pd
import shap
import xgboost
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_pinball_loss, r2_score, root_mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from pipeline.build_features import FEATURE_CATALOG, FEATURE_COLUMNS, POSITION_GROUPS
from pipeline.config import (
    MINIMUM_PRIOR_GAMES,
    MODEL_DIRECTORY,
    PROCESSED_DIRECTORY,
    RANDOM_SEED,
    SEASONS,
    TEST_SEASON,
    TRAIN_SEASONS,
    VALIDATION_SEASON,
    WEB_DATA_DIRECTORY,
)
from pipeline.scoring import DOUBLE_DOUBLE_BONUS, DRAFTKINGS_WEIGHTS, TRIPLE_DOUBLE_BONUS

TARGET = "fantasy_points"
BASELINES = {
    "season_average": "Season average",
    "last_10_average": "Last-10 average",
    "last_5_average": "Last-5 average",
}
MODELS = {
    "ridge": "Ridge regression",
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "ensemble": "Ensemble",
}
QUANTILES = [0.1, 0.5, 0.9]
NOMINAL_COVERAGE = 0.8

XGBOOST_TRIALS = 40
MAXIMUM_BOOSTING_ROUNDS = 3000
EARLY_STOPPING_ROUNDS = 75
RIDGE_PENALTIES = [1, 10, 100, 1000]
RANDOM_FOREST_CANDIDATES = [
    {"min_samples_leaf": leaf, "max_features": share} for leaf in [10, 25, 50] for share in [0.33, 0.5]
]
PERMUTATION_SAMPLE = 6000
BOOTSTRAP_RESAMPLES = 2000
CONTRIBUTIONS_SHOWN = 8
MINUTES_TIERS = [(-np.inf, 15, "Under 15 min"), (15, 25, "15 to 25 min"), (25, 32, "25 to 32 min"), (32, np.inf, "32+ min")]


def score(actual: pd.Series, predicted: pd.Series) -> dict:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(root_mean_squared_error(actual, predicted)),
        "r2": float(r2_score(actual, predicted)),
    }


def baseline_predictions(player_games: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            # A player's first game of a season has no season average yet.
            "season_average": player_games["fantasy_points_season_to_date"].fillna(
                player_games["fantasy_points_mean_last_10"]
            ),
            "last_10_average": player_games["fantasy_points_mean_last_10"],
            "last_5_average": player_games["fantasy_points_mean_last_5"],
        }
    )


def walk_forward_folds(player_games: pd.DataFrame) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    development_seasons = [*TRAIN_SEASONS, VALIDATION_SEASON]
    return [
        (
            player_games[player_games["season"].isin(development_seasons[:fold])],
            player_games[player_games["season"] == development_seasons[fold]],
        )
        for fold in range(1, len(development_seasons))
    ]


def fit_xgboost(
    fit_games: pd.DataFrame,
    parameters: dict,
    rounds: int = MAXIMUM_BOOSTING_ROUNDS,
    check_games: pd.DataFrame | None = None,
    **objective,
) -> xgboost.XGBRegressor:
    model = xgboost.XGBRegressor(
        n_estimators=rounds,
        early_stopping_rounds=EARLY_STOPPING_ROUNDS if check_games is not None else None,
        tree_method="hist",
        random_state=RANDOM_SEED,
        **{"eval_metric": "mae", **objective},
        **parameters,
    )
    evaluation = [(check_games[FEATURE_COLUMNS], check_games[TARGET])] if check_games is not None else None
    model.fit(fit_games[FEATURE_COLUMNS], fit_games[TARGET], eval_set=evaluation, verbose=False)
    return model


def tune_xgboost(folds: list[tuple[pd.DataFrame, pd.DataFrame]]) -> dict:
    def walk_forward_error(trial: optuna.Trial) -> float:
        parameters = {
            "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.15, log=True),
            "max_depth": trial.suggest_int("max_depth", 3, 8),
            "min_child_weight": trial.suggest_float("min_child_weight", 1, 60, log=True),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
            "reg_lambda": trial.suggest_float("reg_lambda", 0.1, 20, log=True),
            "gamma": trial.suggest_float("gamma", 0, 5),
        }
        fold_errors = []
        for fit_games, check_games in folds:
            model = fit_xgboost(fit_games, parameters, check_games=check_games)
            fold_errors.append(mean_absolute_error(check_games[TARGET], model.predict(check_games[FEATURE_COLUMNS])))
        return float(np.mean(fold_errors))

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=RANDOM_SEED))
    study.optimize(walk_forward_error, n_trials=XGBOOST_TRIALS)
    print(f"xgboost: walk-forward MAE {study.best_value:.3f} after {XGBOOST_TRIALS} trials")
    return study.best_params


def fit_random_forest(fit_games: pd.DataFrame, parameters: dict, trees: int) -> RandomForestRegressor:
    forest = RandomForestRegressor(
        n_estimators=trees, max_samples=0.5, n_jobs=-1, random_state=RANDOM_SEED, **parameters
    )
    return forest.fit(fit_games[FEATURE_COLUMNS], fit_games[TARGET])


def tune_random_forest(train_games: pd.DataFrame, validation_games: pd.DataFrame) -> dict:
    errors = []
    for parameters in RANDOM_FOREST_CANDIDATES:
        forest = fit_random_forest(train_games, parameters, trees=200)
        errors.append(mean_absolute_error(validation_games[TARGET], forest.predict(validation_games[FEATURE_COLUMNS])))
    best = int(np.argmin(errors))
    print(f"random forest: validation MAE {errors[best]:.3f} with {RANDOM_FOREST_CANDIDATES[best]}")
    return RANDOM_FOREST_CANDIDATES[best]


def fit_ridge(fit_games: pd.DataFrame, penalty: float):
    model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=penalty))
    return model.fit(fit_games[FEATURE_COLUMNS], fit_games[TARGET])


def tune_ridge(train_games: pd.DataFrame, validation_games: pd.DataFrame) -> float:
    errors = [
        mean_absolute_error(
            validation_games[TARGET], fit_ridge(train_games, penalty).predict(validation_games[FEATURE_COLUMNS])
        )
        for penalty in RIDGE_PENALTIES
    ]
    return RIDGE_PENALTIES[int(np.argmin(errors))]


def best_blend_weight(actual: pd.Series, xgboost_predictions: np.ndarray, forest_predictions: np.ndarray) -> float:
    weights = np.linspace(0, 1, 101)
    errors = [
        mean_absolute_error(actual, weight * xgboost_predictions + (1 - weight) * forest_predictions)
        for weight in weights
    ]
    return float(weights[int(np.argmin(errors))])


def conformal_adjustment(actual: pd.Series, lower: np.ndarray, upper: np.ndarray) -> float:
    """Conformalized quantile regression: widen the band until it covers the calibration season."""
    shortfall = np.maximum(lower - actual, actual - upper)
    rank = min(1.0, math.ceil((len(actual) + 1) * NOMINAL_COVERAGE) / len(actual))
    return float(np.quantile(shortfall, rank))


def bootstrap_improvement(test_games: pd.DataFrame, model: str, baseline: str) -> dict:
    """Resample whole game days so players sharing a slate stay together."""
    absolute_errors = pd.DataFrame(
        {
            "game_date": test_games["game_date"],
            "model": (test_games[model] - test_games[TARGET]).abs(),
            "baseline": (test_games[baseline] - test_games[TARGET]).abs(),
        }
    )
    daily = absolute_errors.groupby("game_date")[["model", "baseline"]].sum().to_numpy()
    generator = np.random.default_rng(RANDOM_SEED)
    draws = generator.integers(0, len(daily), size=(BOOTSTRAP_RESAMPLES, len(daily)))
    resampled = daily[draws].sum(axis=1)
    improvements = 100 * (1 - resampled[:, 0] / resampled[:, 1])
    low, high = np.percentile(improvements, [2.5, 97.5])
    return {
        "percent": float(100 * (1 - daily[:, 0].sum() / daily[:, 1].sum())),
        "interval_low": float(low),
        "interval_high": float(high),
    }


def minutes_tier(typical_minutes: pd.Series) -> pd.Series:
    tiers = pd.Series(index=typical_minutes.index, dtype="object")
    for low, high, label in MINUTES_TIERS:
        tiers[(typical_minutes >= low) & (typical_minutes < high)] = label
    return tiers


def slice_scores(test_games: pd.DataFrame, baseline: str) -> list[dict]:
    groupings = {
        "Position": test_games["position_group"].str.capitalize() + "s",
        "Typical minutes": minutes_tier(test_games["minutes_mean_last_10"].round(1)),
        "Schedule": test_games["is_back_to_back"].map({1: "Back-to-back", 0: "Rested"}),
        "Teammates": test_games["key_teammate_out"].map({1: "Key teammate out", 0: "Full strength"}),
        "Venue": test_games["is_home"].map({1: "Home", 0: "Away"}),
    }
    slices = []
    for dimension, labels in groupings.items():
        for group, group_games in test_games.groupby(labels, sort=False):
            baseline_error = mean_absolute_error(group_games[TARGET], group_games[baseline])
            entry = {"dimension": dimension, "group": group, "games": len(group_games), "baseline_mae": baseline_error}
            for model in MODELS:
                entry[f"{model}_mae"] = float(mean_absolute_error(group_games[TARGET], group_games[model]))
            entry["improvement_percent"] = 100 * (1 - entry["ensemble_mae"] / baseline_error)
            slices.append(entry)
    return slices


def write_json(name: str, payload) -> None:
    destination = WEB_DATA_DIRECTORY / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))


def rounded(values, digits: int = 2) -> list:
    return [None if pd.isna(value) else round(float(value), digits) for value in values]


def export_predictions(test_games: pd.DataFrame) -> None:
    game_dates = sorted(test_games["game_date"].dt.strftime("%Y-%m-%d").unique())
    teams = sorted(test_games["team"].unique())
    date_position = {game_date: position for position, game_date in enumerate(game_dates)}
    team_position = {team: position for position, team in enumerate(teams)}
    positions = list(POSITION_GROUPS.values())
    columns = {
        "player": test_games["player_id"].astype(int).tolist(),
        "date": test_games["game_date"].dt.strftime("%Y-%m-%d").map(date_position).tolist(),
        "team": test_games["team"].map(team_position).tolist(),
        "opponent": test_games["opponent"].map(team_position).tolist(),
        "home": test_games["is_home"].astype(int).tolist(),
        "position": test_games["position_group"].map(positions.index).tolist(),
        "back_to_back": test_games["is_back_to_back"].astype(int).tolist(),
        "key_teammate_out": test_games["key_teammate_out"].astype(int).tolist(),
        "typical_minutes": rounded(test_games["minutes_mean_last_10"], 1),
        "minutes": rounded(test_games["minutes"], 1),
        "actual": rounded(test_games[TARGET]),
    }
    for column in [*BASELINES, *MODELS, "floor", "median", "ceiling"]:
        columns[column] = rounded(test_games[column])
    write_json("predictions.json", {"dates": game_dates, "teams": teams, "positions": positions, "columns": columns})


def export_players(test_games: pd.DataFrame) -> None:
    latest = test_games.sort_values("game_date").groupby("player_id").tail(1).set_index("player_id")
    summary = test_games.groupby("player_id").agg(
        games=(TARGET, "size"), average_actual=(TARGET, "mean"), average_projection=("ensemble", "mean")
    )
    players = [
        {
            "id": int(player_id),
            "name": latest.at[player_id, "player_name"],
            "team": latest.at[player_id, "team"],
            "position": latest.at[player_id, "position_group"],
            "games": int(row["games"]),
            "average_actual": round(float(row["average_actual"]), 1),
            "average_projection": round(float(row["average_projection"]), 1),
        }
        for player_id, row in summary.iterrows()
    ]
    write_json("players.json", sorted(players, key=lambda player: -player["average_projection"]))


def export_explanations(test_games: pd.DataFrame, contributions: np.ndarray, base_value: float) -> None:
    explanation_directory = WEB_DATA_DIRECTORY / "explanations"
    shutil.rmtree(explanation_directory, ignore_errors=True)
    feature_values = test_games[FEATURE_COLUMNS].to_numpy(dtype=float)
    game_dates = test_games["game_date"].dt.strftime("%Y-%m-%d").to_numpy()
    largest_first = np.argsort(-np.abs(contributions), axis=1)

    for player_id, row_positions in test_games.groupby("player_id").indices.items():
        games = {}
        for row in row_positions:
            shown = largest_first[row, :CONTRIBUTIONS_SHOWN]
            games[game_dates[row]] = {
                "contributions": [
                    [
                        int(feature),
                        round(float(contributions[row, feature]), 2),
                        None if np.isnan(feature_values[row, feature]) else round(float(feature_values[row, feature]), 2),
                    ]
                    for feature in shown
                ],
                "remainder": round(float(contributions[row].sum() - contributions[row, shown].sum()), 2),
            }
        write_json(f"explanations/{int(player_id)}.json", {"base_value": round(base_value, 2), "games": games})


def main() -> None:
    player_games = pd.read_parquet(PROCESSED_DIRECTORY / "player_games.parquet")
    eligible = player_games[player_games["prior_games"] >= MINIMUM_PRIOR_GAMES].reset_index(drop=True)
    eligible = eligible.join(baseline_predictions(eligible))

    train_games = eligible[eligible["season"].isin(TRAIN_SEASONS)]
    validation_games = eligible[eligible["season"] == VALIDATION_SEASON].copy()
    test_games = eligible[eligible["season"] == TEST_SEASON].copy()
    development_games = pd.concat([train_games, validation_games])
    print(f"train {len(train_games):,}  validation {len(validation_games):,}  test {len(test_games):,}")

    ridge_penalty = tune_ridge(train_games, validation_games)
    forest_parameters = tune_random_forest(train_games, validation_games)
    xgboost_parameters = tune_xgboost(walk_forward_folds(eligible))

    # Models fit on the training seasons score the validation season, which sets the blend weight.
    validation_xgboost = fit_xgboost(train_games, xgboost_parameters, check_games=validation_games)
    boosting_rounds = validation_xgboost.best_iteration + 1
    validation_games["ridge"] = fit_ridge(train_games, ridge_penalty).predict(validation_games[FEATURE_COLUMNS])
    validation_games["random_forest"] = fit_random_forest(train_games, forest_parameters, trees=500).predict(
        validation_games[FEATURE_COLUMNS]
    )
    validation_games["xgboost"] = validation_xgboost.predict(validation_games[FEATURE_COLUMNS])
    xgboost_weight = best_blend_weight(
        validation_games[TARGET], validation_games["xgboost"].to_numpy(), validation_games["random_forest"].to_numpy()
    )
    validation_games["ensemble"] = (
        xgboost_weight * validation_games["xgboost"] + (1 - xgboost_weight) * validation_games["random_forest"]
    )
    print(f"ensemble: {xgboost_weight:.2f} xgboost, {1 - xgboost_weight:.2f} random forest")

    # Final models refit on every season before the test season, with the settings chosen above.
    final_ridge = fit_ridge(development_games, ridge_penalty)
    final_forest = fit_random_forest(development_games, forest_parameters, trees=500)
    final_xgboost = fit_xgboost(development_games, xgboost_parameters, rounds=boosting_rounds)
    test_games["ridge"] = final_ridge.predict(test_games[FEATURE_COLUMNS])
    test_games["random_forest"] = final_forest.predict(test_games[FEATURE_COLUMNS])
    test_games["xgboost"] = final_xgboost.predict(test_games[FEATURE_COLUMNS])
    test_games["ensemble"] = xgboost_weight * test_games["xgboost"] + (1 - xgboost_weight) * test_games["random_forest"]

    # Quantile models never see the validation season, so it can calibrate the band honestly.
    quantile_objective = {
        "objective": "reg:quantileerror",
        "quantile_alpha": np.array(QUANTILES),
        "eval_metric": "quantile",
    }
    quantile_fit_games, quantile_check_games = walk_forward_folds(eligible)[-2]
    quantile_rounds = (
        fit_xgboost(quantile_fit_games, xgboost_parameters, check_games=quantile_check_games, **quantile_objective).best_iteration
        + 1
    )
    quantile_model = fit_xgboost(train_games, xgboost_parameters, rounds=quantile_rounds, **quantile_objective)
    validation_quantiles = np.sort(quantile_model.predict(validation_games[FEATURE_COLUMNS]), axis=1)
    test_quantiles = np.sort(quantile_model.predict(test_games[FEATURE_COLUMNS]), axis=1)
    band_adjustment = conformal_adjustment(
        validation_games[TARGET], validation_quantiles[:, 0], validation_quantiles[:, -1]
    )
    raw_coverage = float(
        ((test_games[TARGET] >= test_quantiles[:, 0]) & (test_games[TARGET] <= test_quantiles[:, -1])).mean()
    )
    test_games["median"] = test_quantiles[:, 1]
    test_games["floor"] = np.minimum(test_quantiles[:, 0] - band_adjustment, test_games["ensemble"])
    test_games["ceiling"] = np.maximum(test_quantiles[:, -1] + band_adjustment, test_games["ensemble"])

    # Everything reported is computed from the same rounded values the web app loads.
    prediction_columns = [*BASELINES, *MODELS, "floor", "median", "ceiling"]
    test_games[prediction_columns] = test_games[prediction_columns].round(2)
    test_games = test_games.reset_index(drop=True)

    leaderboard = []
    for key, label in {**BASELINES, **MODELS}.items():
        entry = {
            "key": key,
            "label": label,
            "kind": "baseline" if key in BASELINES else "model",
            "test": score(test_games[TARGET], test_games[key]),
            "validation": score(validation_games[TARGET], validation_games[key]),
        }
        leaderboard.append(entry)
    best_baseline = min(BASELINES, key=lambda key: next(entry for entry in leaderboard if entry["key"] == key)["test"]["mae"])
    best_model = min(MODELS, key=lambda key: next(entry for entry in leaderboard if entry["key"] == key)["test"]["mae"])
    for entry in sorted(leaderboard, key=lambda entry: entry["test"]["mae"]):
        print(f"{entry['label']:<18} MAE {entry['test']['mae']:.3f}  RMSE {entry['test']['rmse']:.3f}  R² {entry['test']['r2']:.3f}")

    covered = (test_games[TARGET] >= test_games["floor"]) & (test_games[TARGET] <= test_games["ceiling"])
    intervals = {
        "nominal_coverage": NOMINAL_COVERAGE,
        "raw_coverage": raw_coverage,
        "calibrated_coverage": float(covered.mean()),
        "conformal_adjustment": band_adjustment,
        "average_width": float((test_games["ceiling"] - test_games["floor"]).mean()),
        "pinball_loss": {
            str(quantile): float(mean_pinball_loss(test_games[TARGET], test_quantiles[:, position], alpha=quantile))
            for position, quantile in enumerate(QUANTILES)
        },
    }
    print(f"80% band: raw coverage {raw_coverage:.3f}, calibrated {intervals['calibrated_coverage']:.3f}")

    explainer = shap.TreeExplainer(final_xgboost)
    contributions = explainer.shap_values(test_games[FEATURE_COLUMNS])
    base_value = float(np.ravel(explainer.expected_value)[0])
    reconstruction_gap = np.abs(base_value + contributions.sum(axis=1) - final_xgboost.predict(test_games[FEATURE_COLUMNS])).max()
    assert reconstruction_gap < 0.01, f"SHAP values do not add up to the prediction (gap {reconstruction_gap:.4f})"

    permutation_games = test_games.sample(PERMUTATION_SAMPLE, random_state=RANDOM_SEED)
    permutation = permutation_importance(
        final_forest,
        permutation_games[FEATURE_COLUMNS],
        permutation_games[TARGET],
        scoring="neg_mean_absolute_error",
        n_repeats=5,
        random_state=RANDOM_SEED,
    )
    gain = final_xgboost.get_booster().get_score(importance_type="total_gain")

    MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
    final_xgboost.save_model(MODEL_DIRECTORY / "xgboost.json")
    quantile_model.save_model(MODEL_DIRECTORY / "xgboost_quantiles.json")

    WEB_DATA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    write_json(
        "metrics.json",
        {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "data": {
                "seasons": SEASONS,
                "train_seasons": TRAIN_SEASONS,
                "validation_season": VALIDATION_SEASON,
                "test_season": TEST_SEASON,
                "player_games": len(player_games),
                "train_rows": len(train_games),
                "validation_rows": len(validation_games),
                "test_rows": len(test_games),
                "fit_rows": len(development_games),
                "test_players": int(test_games["player_id"].nunique()),
                "trained_through": development_games["game_date"].max().strftime("%Y-%m-%d"),
                "minimum_prior_games": MINIMUM_PRIOR_GAMES,
            },
            "scoring": {
                "weights": DRAFTKINGS_WEIGHTS,
                "double_double_bonus": DOUBLE_DOUBLE_BONUS,
                "triple_double_bonus": TRIPLE_DOUBLE_BONUS,
            },
            "leaderboard": leaderboard,
            "best_baseline": best_baseline,
            "best_model": best_model,
            "improvement": bootstrap_improvement(test_games, "ensemble", best_baseline),
            "ensemble": {"xgboost_weight": xgboost_weight, "random_forest_weight": 1 - xgboost_weight},
            "intervals": intervals,
            "hyperparameters": {
                "xgboost": {**xgboost_parameters, "boosting_rounds": boosting_rounds, "trials": XGBOOST_TRIALS},
                "random_forest": {**forest_parameters, "trees": 500, "max_samples": 0.5},
                "ridge": {"alpha": ridge_penalty},
            },
            "slices": slice_scores(test_games, best_baseline),
            "features": [{"key": key, "label": label, "group": group} for key, label, group in FEATURE_CATALOG],
        },
    )
    write_json(
        "importance.json",
        {
            "shap": rounded(np.abs(contributions).mean(axis=0), 4),
            "xgboost_gain": rounded([gain.get(feature, 0.0) for feature in FEATURE_COLUMNS], 2),
            "random_forest_permutation": rounded(permutation.importances_mean, 4),
            "random_forest_impurity": rounded(final_forest.feature_importances_, 5),
        },
    )
    export_predictions(test_games)
    export_players(test_games)
    export_explanations(test_games, contributions, base_value)
    print(f"wrote artifacts to {WEB_DATA_DIRECTORY}")


if __name__ == "__main__":
    main()
