import numpy as np
import pandas as pd
import pytest

from pipeline.build_features import (
    BOX_SCORE_COLUMNS,
    FEATURE_COLUMNS,
    RAW_COLUMN_NAMES,
    build_feature_table,
    load_player_index,
    load_raw_game_logs,
)

CUTOFF_DATE = pd.Timestamp("2025-01-15")
ROW_KEYS = ["player_id", "game_id"]


@pytest.fixture(scope="module")
def raw_game_logs() -> pd.DataFrame:
    return load_raw_game_logs()


@pytest.fixture(scope="module")
def player_index() -> pd.DataFrame:
    return load_player_index()


@pytest.fixture(scope="module")
def feature_table(raw_game_logs, player_index) -> pd.DataFrame:
    return build_feature_table(raw_game_logs, player_index)


def test_features_ignore_the_game_being_predicted_and_everything_after(raw_game_logs, player_index, feature_table):
    """Rewrite every box score from the cutoff onward; that day's features must not move."""
    raw_names = {clean: raw for raw, clean in RAW_COLUMN_NAMES.items()}
    generator = np.random.default_rng(0)
    tampered = raw_game_logs.copy()
    from_cutoff = pd.to_datetime(tampered["GAME_DATE"]) >= CUTOFF_DATE
    for column in BOX_SCORE_COLUMNS:
        raw_column = raw_names[column]
        replacement = generator.integers(1, 40, size=from_cutoff.sum()).astype(tampered[raw_column].dtype)
        tampered.loc[from_cutoff, raw_column] = replacement

    tampered_table = build_feature_table(tampered, player_index)
    on_cutoff = feature_table["game_date"] == CUTOFF_DATE
    original = feature_table.loc[on_cutoff].set_index(ROW_KEYS)[FEATURE_COLUMNS].sort_index()
    recomputed = (
        tampered_table.loc[tampered_table["game_date"] == CUTOFF_DATE].set_index(ROW_KEYS)[FEATURE_COLUMNS].sort_index()
    )

    assert len(original) > 50
    pd.testing.assert_frame_equal(original, recomputed, check_exact=False, rtol=1e-9)


def test_the_tampering_would_be_caught_if_a_feature_leaked(raw_game_logs, player_index, feature_table):
    on_cutoff = feature_table["game_date"] == CUTOFF_DATE
    same_game_minutes = feature_table.loc[on_cutoff, "minutes"]
    lagged_minutes = feature_table.loc[on_cutoff, "minutes_last_game"]
    assert not np.allclose(same_game_minutes, lagged_minutes)


def test_no_feature_is_a_same_game_box_score_column():
    assert not set(FEATURE_COLUMNS) & set(BOX_SCORE_COLUMNS)
    assert "fantasy_points" not in FEATURE_COLUMNS


def test_first_career_game_has_no_form_features(feature_table):
    first_games = feature_table[feature_table["prior_games"] == 0]
    assert first_games["fantasy_points_mean_last_5"].isna().all()
    assert first_games["minutes_last_game"].isna().all()
