import numpy as np
import pandas as pd

from pipeline.config import PROCESSED_DIRECTORY, RAW_DIRECTORY, SEASONS
from pipeline.scoring import draftkings_fantasy_points

RAW_COLUMN_NAMES = {
    "SEASON_YEAR": "season",
    "PLAYER_ID": "player_id",
    "PLAYER_NAME": "player_name",
    "TEAM_ID": "team_id",
    "TEAM_ABBREVIATION": "team",
    "GAME_ID": "game_id",
    "GAME_DATE": "game_date",
    "MATCHUP": "matchup",
    "MIN": "minutes",
    "FGM": "field_goals_made",
    "FGA": "field_goal_attempts",
    "FG3M": "three_pointers_made",
    "FTA": "free_throw_attempts",
    "OREB": "offensive_rebounds",
    "REB": "rebounds",
    "AST": "assists",
    "TOV": "turnovers",
    "STL": "steals",
    "BLK": "blocks",
    "PTS": "points",
}

# Everything recorded during a game. Features may only read these from earlier games.
BOX_SCORE_COLUMNS = [
    "minutes",
    "field_goals_made",
    "field_goal_attempts",
    "three_pointers_made",
    "free_throw_attempts",
    "offensive_rebounds",
    "rebounds",
    "assists",
    "turnovers",
    "steals",
    "blocks",
    "points",
]

TEAM_TOTAL_COLUMNS = [
    "minutes",
    "points",
    "field_goals_made",
    "field_goal_attempts",
    "free_throw_attempts",
    "offensive_rebounds",
    "rebounds",
    "turnovers",
]

POSITION_GROUPS = {"G": "guard", "F": "forward", "C": "center"}
ROTATION_WINDOW = 10
ROTATION_MINIMUM_APPEARANCES = 3
ROTATION_MINIMUM_MINUTES = 15
KEY_PLAYER_MINUTES = 28

FEATURE_CATALOG = [
    ("fantasy_points_mean_last_3", "Fantasy points, last 3 games", "Form"),
    ("fantasy_points_mean_last_5", "Fantasy points, last 5 games", "Form"),
    ("fantasy_points_mean_last_10", "Fantasy points, last 10 games", "Form"),
    ("fantasy_points_mean_last_20", "Fantasy points, last 20 games", "Form"),
    ("fantasy_points_recency_weighted", "Fantasy points, recency-weighted", "Form"),
    ("fantasy_points_season_to_date", "Fantasy points, season average", "Form"),
    ("fantasy_points_std_last_10", "Fantasy point volatility, last 10", "Form"),
    ("fantasy_points_max_last_10", "Best game, last 10", "Form"),
    ("fantasy_points_per_minute_last_10", "Fantasy points per minute, last 10", "Form"),
    ("fantasy_points_per_minute_season_to_date", "Fantasy points per minute, season", "Form"),
    ("minutes_last_game", "Minutes, last game", "Minutes"),
    ("minutes_mean_last_3", "Minutes, last 3 games", "Minutes"),
    ("minutes_mean_last_5", "Minutes, last 5 games", "Minutes"),
    ("minutes_mean_last_10", "Minutes, last 10 games", "Minutes"),
    ("minutes_mean_last_20", "Minutes, last 20 games", "Minutes"),
    ("minutes_season_to_date", "Minutes, season average", "Minutes"),
    ("minutes_std_last_10", "Minutes volatility, last 10", "Minutes"),
    ("minutes_trend", "Minutes trend (last 3 vs last 10)", "Minutes"),
    ("usage_rate_last_3", "Usage rate, last 3 games", "Role"),
    ("usage_rate_last_10", "Usage rate, last 10 games", "Role"),
    ("usage_rate_season_to_date", "Usage rate, season", "Role"),
    ("usage_trend", "Usage trend (last 3 vs last 10)", "Role"),
    ("true_shooting_last_10", "True shooting %, last 10", "Role"),
    ("assist_rate_last_10", "Assist rate, last 10", "Role"),
    ("rebound_rate_last_10", "Rebound rate, last 10", "Role"),
    ("starter_proxy_rate_last_5", "Starter-level minutes, share of last 5", "Role"),
    ("starter_proxy_last_game", "Starter-level minutes last game", "Role"),
    ("games_played_season_to_date", "Games played this season", "Role"),
    ("is_home", "Home game", "Schedule"),
    ("team_days_rest", "Team days of rest", "Schedule"),
    ("is_back_to_back", "Back-to-back", "Schedule"),
    ("team_games_in_last_7_days", "Team games in last 7 days", "Schedule"),
    ("player_days_since_last_game", "Days since player's last game", "Schedule"),
    ("games_missed_before", "Team games missed before this one", "Schedule"),
    ("team_pace_season_to_date", "Team pace, season", "Team"),
    ("team_pace_last_10", "Team pace, last 10", "Team"),
    ("team_offensive_rating_season_to_date", "Team offensive rating, season", "Team"),
    ("team_defensive_rating_season_to_date", "Team defensive rating, season", "Team"),
    ("opponent_pace_season_to_date", "Opponent pace, season", "Opponent"),
    ("opponent_offensive_rating_season_to_date", "Opponent offensive rating, season", "Opponent"),
    ("opponent_defensive_rating_season_to_date", "Opponent defensive rating, season", "Opponent"),
    ("opponent_defensive_rating_last_10", "Opponent defensive rating, last 10", "Opponent"),
    ("opponent_fantasy_points_allowed_to_position", "Opponent fantasy points allowed to position", "Opponent"),
    ("opponent_days_rest", "Opponent days of rest", "Opponent"),
    ("vacated_minutes", "Minutes vacated by absent teammates", "Injuries"),
    ("vacated_possessions", "Possessions vacated by absent teammates", "Injuries"),
    ("vacated_minutes_same_position", "Minutes vacated at player's position", "Injuries"),
    ("rotation_players_out", "Rotation teammates out", "Injuries"),
    ("is_guard", "Guard", "Position"),
    ("is_forward", "Forward", "Position"),
    ("is_center", "Center", "Position"),
]
FEATURE_COLUMNS = [key for key, _, _ in FEATURE_CATALOG]


def load_raw_game_logs() -> pd.DataFrame:
    seasons = [pd.read_parquet(RAW_DIRECTORY / f"player_game_logs_{season}.parquet") for season in SEASONS]
    return pd.concat(seasons, ignore_index=True)


def load_player_index() -> pd.DataFrame:
    return pd.read_parquet(RAW_DIRECTORY / "player_index.parquet")


def prepare_player_games(raw_game_logs: pd.DataFrame, player_index: pd.DataFrame) -> pd.DataFrame:
    player_games = raw_game_logs[list(RAW_COLUMN_NAMES)].rename(columns=RAW_COLUMN_NAMES)
    player_games = player_games[player_games["minutes"] > 0].copy()
    player_games["game_date"] = pd.to_datetime(player_games["game_date"])
    player_games["is_home"] = player_games["matchup"].str.contains("vs.", regex=False).astype(int)
    player_games["opponent"] = player_games["matchup"].str.split().str[-1]
    player_games["fantasy_points"] = draftkings_fantasy_points(player_games)

    primary_position = player_index.set_index("PERSON_ID")["POSITION"].str[0]
    player_games["position_group"] = (
        player_games["player_id"].map(primary_position).map(POSITION_GROUPS).fillna("forward")
    )
    return player_games.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)


def rolling_over_prior_games(
    frame: pd.DataFrame,
    column: str,
    window: int,
    statistic: str = "mean",
    keys: tuple[str, ...] = ("player_id",),
    minimum_periods: int = 1,
) -> pd.Series:
    key_columns = [frame[key] for key in keys]
    prior_values = frame.groupby(list(keys))[column].shift(1)
    rolled = prior_values.groupby(key_columns).rolling(window, min_periods=minimum_periods).agg(statistic)
    return rolled.reset_index(level=list(range(len(keys))), drop=True).sort_index()


def expanding_over_prior_games(
    frame: pd.DataFrame,
    column: str,
    statistic: str = "mean",
    keys: tuple[str, ...] = ("player_id", "season"),
) -> pd.Series:
    key_columns = [frame[key] for key in keys]
    prior_values = frame.groupby(list(keys))[column].shift(1)
    expanded = prior_values.groupby(key_columns).expanding(min_periods=1).agg(statistic)
    return expanded.reset_index(level=list(range(len(keys))), drop=True).sort_index()


def games_in_prior_week(game_dates: pd.Series) -> np.ndarray:
    games = pd.Series(1.0, index=pd.DatetimeIndex(game_dates))
    return games.rolling("7D", closed="left").sum().fillna(0).to_numpy()


def build_team_games(player_games: pd.DataFrame) -> pd.DataFrame:
    team_games = player_games.groupby(
        ["season", "game_id", "game_date", "team_id"], as_index=False
    )[TEAM_TOTAL_COLUMNS].sum()
    team_games = team_games.rename(columns={column: f"team_{column}" for column in TEAM_TOTAL_COLUMNS})
    team_games["team_possessions_used"] = (
        team_games["team_field_goal_attempts"]
        + 0.44 * team_games["team_free_throw_attempts"]
        + team_games["team_turnovers"]
    )
    team_games["team_possessions"] = team_games["team_possessions_used"] - team_games["team_offensive_rebounds"]

    opponents = team_games[["game_id", "team_id", "team_points", "team_rebounds", "team_possessions"]].rename(
        columns={
            "team_id": "opponent_team_id",
            "team_points": "opponent_points",
            "team_rebounds": "opponent_rebounds",
            "team_possessions": "opponent_possessions",
        }
    )
    team_games = team_games.merge(opponents, on="game_id")
    team_games = team_games[team_games["team_id"] != team_games["opponent_team_id"]]
    team_games = team_games.sort_values(["team_id", "game_date", "game_id"]).reset_index(drop=True)

    game_possessions = (team_games["team_possessions"] + team_games["opponent_possessions"]) / 2
    team_games["pace"] = 48 * game_possessions / (team_games["team_minutes"] / 5)
    team_games["offensive_rating"] = 100 * team_games["team_points"] / game_possessions
    team_games["defensive_rating"] = 100 * team_games["opponent_points"] / game_possessions

    team_games["team_game_number"] = team_games.groupby(["team_id", "season"]).cumcount() + 1
    team_games["days_rest"] = team_games.groupby("team_id")["game_date"].diff().dt.days.clip(upper=7)
    team_games["is_back_to_back"] = (team_games["days_rest"] == 1).astype(int)
    team_games["games_in_last_7_days"] = team_games.groupby("team_id")["game_date"].transform(games_in_prior_week)

    team_season = ("team_id", "season")
    for rating in ["pace", "offensive_rating", "defensive_rating"]:
        season_to_date = expanding_over_prior_games(team_games, rating, keys=team_season)
        # A team's first game of a season falls back to its full previous season.
        season_means = team_games.groupby(["team_id", "season"])[rating].mean().groupby(level="team_id").shift(1)
        previous_season = pd.Series(
            pd.MultiIndex.from_frame(team_games[["team_id", "season"]]).map(season_means), index=team_games.index
        )
        team_games[f"{rating}_season_to_date"] = season_to_date.fillna(previous_season)
    team_games["pace_last_10"] = rolling_over_prior_games(team_games, "pace", 10, keys=("team_id",))
    team_games["defensive_rating_last_10"] = rolling_over_prior_games(
        team_games, "defensive_rating", 10, keys=("team_id",)
    )
    return team_games


def build_absence_features(player_games: pd.DataFrame) -> pd.DataFrame:
    """Minutes and possessions left behind by rotation teammates who sit out a game."""
    team_seasons = []
    for (season, team_id), team_rows in player_games.groupby(["season", "team_id"]):
        minutes = team_rows.pivot(index="team_game_number", columns="player_id", values="minutes").fillna(0.0)
        possessions_used = team_rows.pivot(
            index="team_game_number", columns="player_id", values="usage_numerator"
        ).fillna(0.0)
        played = minutes > 0

        appearances = played.astype(float).shift(1).rolling(ROTATION_WINDOW, min_periods=1).sum()
        typical_minutes = minutes.shift(1).rolling(ROTATION_WINDOW, min_periods=1).sum() / appearances
        typical_possessions = possessions_used.shift(1).rolling(ROTATION_WINDOW, min_periods=1).sum() / appearances
        in_rotation = (appearances >= ROTATION_MINIMUM_APPEARANCES) & (typical_minutes >= ROTATION_MINIMUM_MINUTES)
        absent = in_rotation & ~played
        absent_minutes = typical_minutes.where(absent, 0.0)

        positions = team_rows.drop_duplicates("player_id").set_index("player_id")["position_group"]
        absences = pd.DataFrame(
            {
                "season": season,
                "team_id": team_id,
                "vacated_minutes": absent_minutes.sum(axis=1),
                "vacated_possessions": typical_possessions.where(absent, 0.0).sum(axis=1),
                "rotation_players_out": absent.sum(axis=1),
                "key_teammate_out": (absent_minutes >= KEY_PLAYER_MINUTES).any(axis=1).astype(int),
            }
        )
        for position_group in POSITION_GROUPS.values():
            at_position = positions.reindex(absent_minutes.columns) == position_group
            absences[f"vacated_minutes_{position_group}"] = absent_minutes.loc[:, at_position.to_numpy()].sum(axis=1)
        team_seasons.append(absences.reset_index())
    return pd.concat(team_seasons, ignore_index=True)


def build_position_defense(player_games: pd.DataFrame) -> pd.DataFrame:
    """Fantasy points each defense has allowed to a position group, season to date."""
    allowed = player_games.groupby(
        ["season", "game_id", "game_date", "opponent_team_id", "position_group"], as_index=False
    )["fantasy_points"].sum()
    allowed = allowed.sort_values(["opponent_team_id", "position_group", "game_date", "game_id"]).reset_index(drop=True)
    allowed["opponent_fantasy_points_allowed_to_position"] = expanding_over_prior_games(
        allowed, "fantasy_points", keys=("opponent_team_id", "position_group", "season")
    )
    return allowed[["game_id", "opponent_team_id", "position_group", "opponent_fantasy_points_allowed_to_position"]]


def ratio_of_prior_sums(
    frame: pd.DataFrame, numerator: str, denominator: str, window: int | None, scale: float = 1.0
) -> pd.Series:
    if window is None:
        numerator_sum = expanding_over_prior_games(frame, numerator, "sum")
        denominator_sum = expanding_over_prior_games(frame, denominator, "sum")
    else:
        numerator_sum = rolling_over_prior_games(frame, numerator, window, "sum")
        denominator_sum = rolling_over_prior_games(frame, denominator, window, "sum")
    return scale * numerator_sum / denominator_sum.where(denominator_sum > 0)


def build_feature_table(raw_game_logs: pd.DataFrame, player_index: pd.DataFrame) -> pd.DataFrame:
    player_games = prepare_player_games(raw_game_logs, player_index)
    team_games = build_team_games(player_games)

    own_team_columns = [
        "game_id",
        "team_id",
        "opponent_team_id",
        "team_game_number",
        "team_minutes",
        "team_field_goals_made",
        "team_possessions_used",
        "team_rebounds",
        "opponent_rebounds",
        "days_rest",
        "is_back_to_back",
        "games_in_last_7_days",
        "pace_season_to_date",
        "pace_last_10",
        "offensive_rating_season_to_date",
        "defensive_rating_season_to_date",
    ]
    player_games = player_games.merge(
        team_games[own_team_columns].rename(
            columns={
                "days_rest": "team_days_rest",
                "games_in_last_7_days": "team_games_in_last_7_days",
                "pace_season_to_date": "team_pace_season_to_date",
                "pace_last_10": "team_pace_last_10",
                "offensive_rating_season_to_date": "team_offensive_rating_season_to_date",
                "defensive_rating_season_to_date": "team_defensive_rating_season_to_date",
            }
        ),
        on=["game_id", "team_id"],
        how="left",
    )
    opponent_columns = {
        "team_id": "opponent_team_id",
        "days_rest": "opponent_days_rest",
        "pace_season_to_date": "opponent_pace_season_to_date",
        "offensive_rating_season_to_date": "opponent_offensive_rating_season_to_date",
        "defensive_rating_season_to_date": "opponent_defensive_rating_season_to_date",
        "defensive_rating_last_10": "opponent_defensive_rating_last_10",
    }
    player_games = player_games.merge(
        team_games[["game_id", *opponent_columns]].rename(columns=opponent_columns),
        on=["game_id", "opponent_team_id"],
        how="left",
    )
    player_games = player_games.sort_values(["player_id", "game_date", "game_id"]).reset_index(drop=True)

    minutes_per_lineup_slot = player_games["team_minutes"] / 5
    floor_share = player_games["minutes"] / minutes_per_lineup_slot
    player_games["usage_numerator"] = (
        player_games["field_goal_attempts"] + 0.44 * player_games["free_throw_attempts"] + player_games["turnovers"]
    )
    player_games["usage_denominator"] = floor_share * player_games["team_possessions_used"]
    player_games["true_shooting_attempts"] = 2 * (
        player_games["field_goal_attempts"] + 0.44 * player_games["free_throw_attempts"]
    )
    player_games["assist_denominator"] = (
        floor_share * player_games["team_field_goals_made"] - player_games["field_goals_made"]
    ).clip(lower=0)
    player_games["rebound_denominator"] = floor_share * (
        player_games["team_rebounds"] + player_games["opponent_rebounds"]
    )
    minutes_rank = player_games.groupby(["game_id", "team_id"])["minutes"].rank(ascending=False, method="first")
    player_games["starter_proxy"] = (minutes_rank <= 5).astype(float)

    features = {}
    for window in [3, 5, 10, 20]:
        features[f"fantasy_points_mean_last_{window}"] = rolling_over_prior_games(player_games, "fantasy_points", window)
        features[f"minutes_mean_last_{window}"] = rolling_over_prior_games(player_games, "minutes", window)
    prior_fantasy_points = player_games.groupby("player_id")["fantasy_points"].shift(1)
    features["fantasy_points_recency_weighted"] = (
        prior_fantasy_points.groupby(player_games["player_id"]).ewm(halflife=5).mean().reset_index(level=0, drop=True).sort_index()
    )
    features["fantasy_points_season_to_date"] = expanding_over_prior_games(player_games, "fantasy_points")
    features["fantasy_points_std_last_10"] = rolling_over_prior_games(
        player_games, "fantasy_points", 10, "std", minimum_periods=2
    )
    features["fantasy_points_max_last_10"] = rolling_over_prior_games(player_games, "fantasy_points", 10, "max")
    features["fantasy_points_per_minute_last_10"] = ratio_of_prior_sums(player_games, "fantasy_points", "minutes", 10)
    features["fantasy_points_per_minute_season_to_date"] = ratio_of_prior_sums(
        player_games, "fantasy_points", "minutes", None
    )
    features["minutes_last_game"] = player_games.groupby("player_id")["minutes"].shift(1)
    features["minutes_season_to_date"] = expanding_over_prior_games(player_games, "minutes")
    features["minutes_std_last_10"] = rolling_over_prior_games(player_games, "minutes", 10, "std", minimum_periods=2)
    features["minutes_trend"] = features["minutes_mean_last_3"] - features["minutes_mean_last_10"]

    features["usage_rate_last_3"] = ratio_of_prior_sums(player_games, "usage_numerator", "usage_denominator", 3, 100)
    features["usage_rate_last_10"] = ratio_of_prior_sums(player_games, "usage_numerator", "usage_denominator", 10, 100)
    features["usage_rate_season_to_date"] = ratio_of_prior_sums(
        player_games, "usage_numerator", "usage_denominator", None, 100
    )
    features["usage_trend"] = features["usage_rate_last_3"] - features["usage_rate_last_10"]
    features["true_shooting_last_10"] = ratio_of_prior_sums(player_games, "points", "true_shooting_attempts", 10, 100)
    features["assist_rate_last_10"] = ratio_of_prior_sums(player_games, "assists", "assist_denominator", 10, 100)
    features["rebound_rate_last_10"] = ratio_of_prior_sums(player_games, "rebounds", "rebound_denominator", 10, 100)
    features["starter_proxy_rate_last_5"] = rolling_over_prior_games(player_games, "starter_proxy", 5)
    features["starter_proxy_last_game"] = player_games.groupby("player_id")["starter_proxy"].shift(1)
    features["games_played_season_to_date"] = player_games.groupby(["player_id", "season"]).cumcount()
    features["prior_games"] = player_games.groupby("player_id").cumcount()

    features["player_days_since_last_game"] = (
        player_games.groupby("player_id")["game_date"].diff().dt.days.clip(upper=30)
    )
    previous_game = player_games.groupby("player_id")[["team_id", "season", "team_game_number"]].shift(1)
    same_stint = (previous_game["team_id"] == player_games["team_id"]) & (
        previous_game["season"] == player_games["season"]
    )
    first_game_of_season = features["games_played_season_to_date"] == 0
    features["games_missed_before"] = np.select(
        [same_stint, first_game_of_season],
        [
            player_games["team_game_number"] - previous_game["team_game_number"] - 1,
            player_games["team_game_number"] - 1,
        ],
        default=0,
    )
    player_games = player_games.assign(**features)

    player_games = player_games.merge(
        build_absence_features(player_games), on=["season", "team_id", "team_game_number"], how="left"
    )
    player_games["vacated_minutes_same_position"] = np.select(
        [player_games["position_group"] == position_group for position_group in POSITION_GROUPS.values()],
        [player_games[f"vacated_minutes_{position_group}"] for position_group in POSITION_GROUPS.values()],
    )
    player_games = player_games.merge(
        build_position_defense(player_games), on=["game_id", "opponent_team_id", "position_group"], how="left"
    )
    for position_group in POSITION_GROUPS.values():
        player_games[f"is_{position_group}"] = (player_games["position_group"] == position_group).astype(int)

    return player_games.sort_values(["game_date", "game_id", "team_id", "player_id"]).reset_index(drop=True)


def main() -> None:
    feature_table = build_feature_table(load_raw_game_logs(), load_player_index())
    PROCESSED_DIRECTORY.mkdir(parents=True, exist_ok=True)
    feature_table.to_parquet(PROCESSED_DIRECTORY / "player_games.parquet", index=False)
    print(f"{len(feature_table):,} player-games, {len(FEATURE_COLUMNS)} features")
    print(feature_table.groupby("season").size().to_string())


if __name__ == "__main__":
    main()
