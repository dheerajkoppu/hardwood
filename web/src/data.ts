export type Position = "guard" | "forward" | "center";
export type BaselineKey =
  "season_average" | "last_10_average" | "last_5_average";
export type ModelKey = "ridge" | "random_forest" | "xgboost" | "ensemble";
export type PredictorKey = BaselineKey | ModelKey;

export const BASELINE_KEYS: BaselineKey[] = [
  "season_average",
  "last_10_average",
  "last_5_average",
];
export const MODEL_KEYS: ModelKey[] = [
  "ridge",
  "random_forest",
  "xgboost",
  "ensemble",
];
export const PREDICTOR_KEYS: PredictorKey[] = [...BASELINE_KEYS, ...MODEL_KEYS];
export const COMPARED_MODELS: ModelKey[] = [
  "random_forest",
  "xgboost",
  "ensemble",
];

export const PREDICTOR_LABELS: Record<PredictorKey, string> = {
  season_average: "Season average",
  last_10_average: "Last-10 average",
  last_5_average: "Last-5 average",
  ridge: "Ridge regression",
  random_forest: "Random Forest",
  xgboost: "XGBoost",
  ensemble: "Ensemble",
};

export const PREDICTOR_COLORS: Record<PredictorKey, string> = {
  season_average: "var(--baseline)",
  last_10_average: "var(--baseline)",
  last_5_average: "var(--baseline)",
  ridge: "var(--ink-2)",
  random_forest: "var(--forest)",
  xgboost: "var(--xgboost)",
  ensemble: "var(--leather)",
};

export const POSITION_LABELS: Record<Position, string> = {
  guard: "Guard",
  forward: "Forward",
  center: "Center",
};

export interface Scores {
  mae: number;
  rmse: number;
  r2: number;
}

export interface LeaderboardEntry {
  key: PredictorKey;
  label: string;
  kind: "baseline" | "model";
  test: Scores;
  validation: Scores;
}

export interface SliceScore {
  dimension: string;
  group: string;
  games: number;
  baseline_mae: number;
  ensemble_mae: number;
  improvement_percent: number;
}

export interface FeatureDescription {
  key: string;
  label: string;
  group: string;
}

export interface Metrics {
  generated_at: string;
  data: {
    seasons: string[];
    train_seasons: string[];
    validation_season: string;
    test_season: string;
    player_games: number;
    train_rows: number;
    validation_rows: number;
    test_rows: number;
    fit_rows: number;
    test_players: number;
    trained_through: string;
    minimum_prior_games: number;
  };
  scoring: {
    weights: Record<string, number>;
    double_double_bonus: number;
    triple_double_bonus: number;
  };
  leaderboard: LeaderboardEntry[];
  best_baseline: BaselineKey;
  best_model: ModelKey;
  improvement: { percent: number; interval_low: number; interval_high: number };
  ensemble: { xgboost_weight: number; random_forest_weight: number };
  intervals: {
    nominal_coverage: number;
    raw_coverage: number;
    calibrated_coverage: number;
    conformal_adjustment: number;
    average_width: number;
    pinball_loss: Record<string, number>;
  };
  hyperparameters: {
    xgboost: Record<string, number>;
    random_forest: Record<string, number>;
    ridge: Record<string, number>;
  };
  slices: SliceScore[];
  features: FeatureDescription[];
}

export interface Game {
  playerId: number;
  date: string;
  team: string;
  opponent: string;
  isHome: boolean;
  position: Position;
  isBackToBack: boolean;
  keyTeammateOut: boolean;
  typicalMinutes: number;
  minutes: number;
  actual: number;
  predicted: Record<PredictorKey, number>;
  floor: number;
  median: number;
  ceiling: number;
}

export interface Player {
  id: number;
  name: string;
  team: string;
  position: Position;
  games: number;
  average_actual: number;
  average_projection: number;
}

export interface Importance {
  shap: number[];
  xgboost_gain: number[];
  random_forest_permutation: number[];
  random_forest_impurity: number[];
}

export type Contribution = [
  featureIndex: number,
  contribution: number,
  featureValue: number | null,
];

export interface Explanation {
  base_value: number;
  games: Record<string, { contributions: Contribution[]; remainder: number }>;
}

interface PredictionFile {
  dates: string[];
  teams: string[];
  positions: Position[];
  columns: Record<string, number[]>;
}

export interface Dataset {
  metrics: Metrics;
  importance: Importance;
  games: Game[];
  dates: string[];
  teams: string[];
  players: Player[];
  playersById: Map<number, Player>;
  gamesByDate: Map<string, Game[]>;
  gamesByPlayer: Map<number, Game[]>;
}

const DATA_DIRECTORY = `${import.meta.env.BASE_URL}data`;

async function fetchJson<Payload>(name: string): Promise<Payload> {
  const response = await fetch(`${DATA_DIRECTORY}/${name}`);
  if (!response.ok) throw new Error(`${name} returned ${response.status}`);
  return (await response.json()) as Payload;
}

export function buildGames(file: PredictionFile): Game[] {
  const { columns } = file;
  return columns.player.map((playerId, row) => ({
    playerId,
    date: file.dates[columns.date[row]],
    team: file.teams[columns.team[row]],
    opponent: file.teams[columns.opponent[row]],
    isHome: columns.home[row] === 1,
    position: file.positions[columns.position[row]],
    isBackToBack: columns.back_to_back[row] === 1,
    keyTeammateOut: columns.key_teammate_out[row] === 1,
    typicalMinutes: columns.typical_minutes[row],
    minutes: columns.minutes[row],
    actual: columns.actual[row],
    predicted: Object.fromEntries(
      PREDICTOR_KEYS.map((key) => [key, columns[key][row]]),
    ) as Record<PredictorKey, number>,
    floor: columns.floor[row],
    median: columns.median[row],
    ceiling: columns.ceiling[row],
  }));
}

function groupGames<Key>(
  games: Game[],
  keyOf: (game: Game) => Key,
): Map<Key, Game[]> {
  const groups = new Map<Key, Game[]>();
  for (const game of games) {
    const key = keyOf(game);
    const group = groups.get(key);
    if (group) group.push(game);
    else groups.set(key, [game]);
  }
  return groups;
}

export async function loadDataset(): Promise<Dataset> {
  const [metrics, importance, predictionFile, players] = await Promise.all([
    fetchJson<Metrics>("metrics.json"),
    fetchJson<Importance>("importance.json"),
    fetchJson<PredictionFile>("predictions.json"),
    fetchJson<Player[]>("players.json"),
  ]);
  const games = buildGames(predictionFile);
  return {
    metrics,
    importance,
    games,
    dates: predictionFile.dates,
    teams: predictionFile.teams,
    players,
    playersById: new Map(players.map((player) => [player.id, player])),
    gamesByDate: groupGames(games, (game) => game.date),
    gamesByPlayer: groupGames(games, (game) => game.playerId),
  };
}

const explanationRequests = new Map<number, Promise<Explanation>>();

export function loadExplanation(playerId: number): Promise<Explanation> {
  let request = explanationRequests.get(playerId);
  if (!request) {
    request = fetchJson<Explanation>(`explanations/${playerId}.json`);
    explanationRequests.set(playerId, request);
  }
  return request;
}
