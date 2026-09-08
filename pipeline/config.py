from pathlib import Path

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
RAW_DIRECTORY = PROJECT_DIRECTORY / "data" / "raw"
PROCESSED_DIRECTORY = PROJECT_DIRECTORY / "data" / "processed"
WEB_DATA_DIRECTORY = PROJECT_DIRECTORY / "web" / "public" / "data"
MODEL_DIRECTORY = PROJECT_DIRECTORY / "models"

SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
TRAIN_SEASONS = ["2021-22", "2022-23", "2023-24"]
VALIDATION_SEASON = "2024-25"
TEST_SEASON = "2025-26"

# A player needs this many earlier games before any model or baseline scores them.
MINIMUM_PRIOR_GAMES = 5

RANDOM_SEED = 7
