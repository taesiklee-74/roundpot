// src/lib/betting/types.ts
// 라운드팟 내기 엔진 공통 타입
// 목적: 스트로크, 스킨스, 라스베가스, 후세인, 순환게임 계산 로직을 UI에서 분리하기 위한 기준 타입
import type { PlayerHandicapSettings } from "./handicap";

export type ID = string;

export type Player = {
  id: ID;
  name: string;
  order?: number;
  handicap?: PlayerHandicapSettings | null;
};

export type Hole = {
  id: string;
  holeNumber: number;
  par: 3 | 4 | 5;
  handicapRank?: number | null;
};

export type Score = {
  holeId: ID;
  playerId: ID;
  strokes: number | null;
};

export type BettingMode =
  | "stroke"
  | "skins"
  | "vegas"
  | "hussein"
  | "school"
  | "cycle";

export type VegasTeamMode =
  | "randomAfterHole"
  | "previousRanks";

export type VegasTeamAssignmentMode =
  | "auto"
  | "manual";

export type HusseinSelector =
  | "previousFirst"
  | "previousSecond";

export type HusseinCompareMode =
  | "bestScore"
  | "tripleSum";

export type CycleTieMode =
  | "carryOnlyNextGame"
  | "carryAndRepeatSameGame";

export type OecdStage = 0 | 1 | 2 | 3;

export type OecdExitRule = "untilZero" | "belowEntryAmount";

export type OecdPenaltyDestination = "commonPot" | "winner";

export type OecdSettings = {
  enabled: boolean;
  stage1Amount: number;
  stage2Amount: number;
  stage3Amount: number;
  exitRule: OecdExitRule;
  penaltyDestination: OecdPenaltyDestination;
};

export type OecdPlayerStatus = {
  playerId: ID;
  stage: OecdStage;
  isTarget: boolean;
  cumulativeBeforeHole: number;
};

export type HoleOecdPenalty = {
  holeId: ID;
  holeNumber: number;
  playerId: ID;
  amount: number;
};

export type StrokeSettings = {
  enabled: boolean;
  amountPerStroke: number;
};

export type SkinsSettings = {
  enabled: boolean;
  amountPerHole: number;
  carryOverEnabled: boolean;
};

export type VegasSettings = {
  enabled: boolean;
  amountPerHole: number;
  carryOverEnabled: boolean;
  teamMode: VegasTeamMode;
  teamAssignmentMode?: VegasTeamAssignmentMode;
};

export type HusseinSettings = {
  enabled: boolean;
  amountPerHole: number;
  carryOverEnabled: boolean;
  selector: HusseinSelector;
  compareMode: HusseinCompareMode;
};

export type SchoolSettings = {
  enabled: boolean;
  firstPrizeAmount: number;
  secondPrizeAmount: number;
  carryOverEnabled: boolean;
};

export type CycleSettings = {
  enabled: boolean;
  skinsAmount: number;
  husseinAmount: number;
  vegasAmount: number;
  tieMode: CycleTieMode;
  husseinSelector: HusseinSelector;
  husseinCompareMode: HusseinCompareMode;
  vegasTeamMode: VegasTeamMode;
};

export type BettingSettingsV2 = {
  mode: BettingMode;
  stroke: StrokeSettings;
  skins: SkinsSettings;
  vegas: VegasSettings;
  hussein: HusseinSettings;
  school: SchoolSettings;
  cycle: CycleSettings;
  oecd: OecdSettings;
};

export type PlayerScoreSummary = {
  playerId: ID;
  playerName: string;
  holesPlayed: number;
  totalStrokes: number;
  totalPar: number;
  scoreToPar: number;
  frontNineTotal: number;
  backNineTotal: number;
  handicap: number;
  netStrokes: number;
};

export type RankingResult = PlayerScoreSummary & {
  rank: number | null;
};

export type PairwiseSettlement = {
  fromPlayerId: ID;
  toPlayerId: ID;
  amount: number;
  reason: string;
};

export type StrokeBetResult = {
  totals: Record<ID, number>;
  pairwiseSettlements: PairwiseSettlement[];
};

export type GameType =
  | "stroke"
  | "skins"
  | "vegas"
  | "hussein"
  | "school"
  | "cycle";

export type WinnerType =
  | "player"
  | "team"
  | "none";

export type HoleGameResult = {
  holeId: ID;
  holeNumber: number;
  gameType: GameType;
  title: string;
  description: string;
  detail?: string;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
  winnerType: WinnerType;
  winnerPlayerIds: ID[];
  isCarryOver: boolean;

  tiedPlayerIds?: ID[];

  // Hussein display fields
  husseinPlayerId?: ID;
  husseinPlayerScore?: number;
  restPlayerIds?: ID[];
  restBestScore?: number;
  restTotalScore?: number;
  husseinCompareScore?: number;
  restCompareScore?: number;
  husseinWinnerType?: "hussein" | "rest" | "tie";
};

export type GameResult = {
  gameType: GameType;
  prizeTotals: Record<ID, number>;
  netTotals?: Record<ID, number>;
  holeResults: HoleGameResult[];
  remainingCarryOver: number;
  poolCollected: number;
  poolPaid: number;
};

export type Team = {
  id: "A" | "B";
  name: string;
  playerIds: ID[];
};

export type TeamAssignment = {
  holeId: ID;
  holeNumber: number;
  teams: [Team, Team];
  reason: string;
};

export type CurrentGamePreview = {
  holeId: ID;
  holeNumber: number;
  gameType: GameType;
  title: string;
  description: string;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
  teams?: [Team, Team];
  husseinPlayerId?: ID | null;
};

export type BettingCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: BettingSettingsV2;
};

export type BettingCalculationResult = {
  mode: BettingMode;
  gameResult: GameResult;
  currentGamePreview: CurrentGamePreview | null;
};

export const DEFAULT_BETTING_SETTINGS: BettingSettingsV2 = {
  mode: "skins",
  stroke: {
    enabled: false,
    amountPerStroke: 1000,
  },
  skins: {
    enabled: true,
    amountPerHole: 10000,
    carryOverEnabled: true,
  },
  vegas: {
    enabled: false,
    amountPerHole: 10000,
    carryOverEnabled: true,
    teamMode: "randomAfterHole",
  },
  hussein: {
    enabled: false,
    amountPerHole: 30000,
    carryOverEnabled: true,
    selector: "previousFirst",
    compareMode: "bestScore",
  },
  school: {
    enabled: false,
    firstPrizeAmount: 10000,
    secondPrizeAmount: 10000,
    carryOverEnabled: true,
  },
  cycle: {
    enabled: false,
    skinsAmount: 10000,
    husseinAmount: 30000,
    vegasAmount: 20000,
    tieMode: "carryAndRepeatSameGame",
    husseinSelector: "previousFirst",
    husseinCompareMode: "bestScore",
    vegasTeamMode: "previousRanks",
  },
  oecd: {
    enabled: false,
    stage1Amount: 60000,
    stage2Amount: 100000,
    stage3Amount: 140000,
    exitRule: "untilZero",
    penaltyDestination: "commonPot",
  },
};

export function createZeroTotals(players: Player[]): Record<ID, number> {
  return players.reduce<Record<ID, number>>((acc, player) => {
    acc[player.id] = 0;
    return acc;
  }, {});
}

export function getScoreKey(holeId: ID, playerId: ID): string {
  return `${holeId}:${playerId}`;
}

export function buildScoreMap(scores: Score[]): Map<string, Score> {
  const scoreMap = new Map<string, Score>();

  for (const score of scores) {
    scoreMap.set(getScoreKey(score.holeId, score.playerId), score);
  }

  return scoreMap;
}

export function isHoleCompleted(
  players: Player[],
  hole: Hole,
  scores: Score[]
): boolean {
  const scoreMap = buildScoreMap(scores);

  return players.every((player) => {
    const score = scoreMap.get(getScoreKey(hole.id, player.id));
    return score?.strokes !== null && score?.strokes !== undefined;
  });
}

export function getPlayerStrokes(
  scores: Score[],
  holeId: ID,
  playerId: ID
): number | null {
  const score = scores.find(
    (item) => item.holeId === holeId && item.playerId === playerId
  );

  return score?.strokes ?? null;
}

export function getCompletedHoles(
  players: Player[],
  holes: Hole[],
  scores: Score[]
): Hole[] {
  return holes
    .slice()
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .filter((hole) => isHoleCompleted(players, hole, scores));
}

export function formatGameType(gameType: GameType): string {
  if (gameType === "stroke") return "스트로크";
  if (gameType === "skins") return "스킨스";
  if (gameType === "vegas") return "라스베가스";
  if (gameType === "hussein") return "후세인";
  if (gameType === "school") return "학교";
  return "순환게임";
}
