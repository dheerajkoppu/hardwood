import argparse
import time

import pandas as pd
from nba_api.stats.endpoints import playergamelogs, playerindex

from pipeline.config import RAW_DIRECTORY, SEASONS

ATTEMPTS = 4
PAUSE_SECONDS = 3


def fetch_with_retries(request, description: str) -> pd.DataFrame:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return request().get_data_frames()[0]
        except Exception as error:
            if attempt == ATTEMPTS:
                raise
            print(f"{description}: attempt {attempt} failed ({type(error).__name__}), retrying")
            time.sleep(PAUSE_SECONDS * attempt)


def fetch_player_game_logs(season: str) -> pd.DataFrame:
    return fetch_with_retries(
        lambda: playergamelogs.PlayerGameLogs(
            season_nullable=season,
            season_type_nullable="Regular Season",
            timeout=90,
        ),
        f"game logs {season}",
    )


def fetch_player_index() -> pd.DataFrame:
    return fetch_with_retries(
        lambda: playerindex.PlayerIndex(season=SEASONS[-1], historical_nullable=1, timeout=90),
        "player index",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NBA player game logs from stats.nba.com")
    parser.add_argument("--refresh", action="store_true", help="re-download files that are already cached")
    arguments = parser.parse_args()

    RAW_DIRECTORY.mkdir(parents=True, exist_ok=True)

    for season in SEASONS:
        destination = RAW_DIRECTORY / f"player_game_logs_{season}.parquet"
        if destination.exists() and not arguments.refresh:
            print(f"{season}: cached")
            continue
        game_logs = fetch_player_game_logs(season)
        game_logs.to_parquet(destination, index=False)
        print(f"{season}: {len(game_logs):,} player-games")
        time.sleep(PAUSE_SECONDS)

    destination = RAW_DIRECTORY / "player_index.parquet"
    if not destination.exists() or arguments.refresh:
        player_index = fetch_player_index()
        player_index.to_parquet(destination, index=False)
        print(f"player index: {len(player_index):,} players")


if __name__ == "__main__":
    main()
