import pandas as pd

DRAFTKINGS_WEIGHTS = {
    "points": 1.0,
    "three_pointers_made": 0.5,
    "rebounds": 1.25,
    "assists": 1.5,
    "steals": 2.0,
    "blocks": 2.0,
    "turnovers": -0.5,
}
DOUBLE_DOUBLE_BONUS = 1.5
TRIPLE_DOUBLE_BONUS = 3.0
DOUBLE_DIGIT_CATEGORIES = ["points", "rebounds", "assists", "steals", "blocks"]


def draftkings_fantasy_points(box_scores: pd.DataFrame) -> pd.Series:
    weighted_total = sum(box_scores[column] * weight for column, weight in DRAFTKINGS_WEIGHTS.items())
    double_digit_count = (box_scores[DOUBLE_DIGIT_CATEGORIES] >= 10).sum(axis=1)
    return (
        weighted_total
        + DOUBLE_DOUBLE_BONUS * (double_digit_count >= 2)
        + TRIPLE_DOUBLE_BONUS * (double_digit_count >= 3)
    )
