// app/page.tsx
// 라운드팟 MVP 리팩터링 + School 게임 연결 버전
// 사용하는 파일:
// src/lib/betting/types.ts
// src/lib/betting/stroke.ts
// src/lib/betting/skins.ts
// src/lib/betting/vegas.ts
// src/lib/betting/hussein.ts
// src/lib/betting/school.ts
// src/lib/betting/cycle.ts
// src/lib/betting/settlement.ts

"use client";

import { useEffect, useMemo, useState } from "react";
import ScorecardSection from "./components/ScorecardSection";
import CurrentGamePreviewCard from "./components/CurrentGamePreviewCard";
import LatestResultSection from "./components/LatestResultSection";
import NearWinnerSelector from "./components/NearWinnerSelector";
import OecdPenaltyInputSection from "./components/OecdPenaltyInputSection";
import OecdSettingsCard from "./components/OecdSettingsCard";
import RoundShareCard from "./components/RoundShareCard";
import { buildRoundSummaryText } from "../src/lib/share/roundSummary";
import {
  getHandicapScoreAdjustmentsForHole,
  getHandicapStrokeForHole,
  getHandicapEligiblePlayersForHole,
  type HandicapEligiblePlayerForHole,
  type HandicapParValue,
  type HandicapScoreAdjustment,
  type PlayerHandicapSettings,
} from "../src/lib/betting/handicap";
import {
  DEFAULT_BETTING_SETTINGS,
  Team,
  type BettingMode,
  type BettingSettingsV2,
  type CurrentGamePreview,
  type GameResult,
  type Hole,
  type HoleOecdPenalty,
  type OecdPlayerStatus,
  type Player,
  type Score,
  type TeamAssignment,
} from "../src/lib/betting/types";
import {
  calculateStrokeBet,
  calculateStrokeGameResult,
  getLatestStrokeResult,
  getStrokeCurrentGamePreview,
} from "../src/lib/betting/stroke";
import {
  calculateSkinsBet,
  getSkinsCurrentGamePreview,
  getSkinsPoolSummary,
} from "../src/lib/betting/skins";
import {
  calculateVegasBet,
  createVegasTeamAssignment,
  getVegasCurrentGamePreview,
  getVegasPoolSummary,
} from "../src/lib/betting/vegas";
import {
  calculateHusseinBet,
  createHusseinAssignment,
  getHusseinCurrentGamePreview,
  getHusseinPoolSummary,
  type HusseinAssignment,
} from "../src/lib/betting/hussein";
import {
  calculateSchoolBet,
  getSchoolCurrentGamePreview,
  getSchoolPoolSummary,
} from "../src/lib/betting/school";
import {
  calculateCycleBet,
  getCycleCurrentGamePreview,
  getCyclePoolSummary,
} from "../src/lib/betting/cycle";
import {
  calculateSettlementSummary,
  formatAmount,
  formatPrizeBreakdown,
  formatSettlementReference,
  getLatestGameResult,
} from "../src/lib/betting/settlement";
import {
  calculateNearSettlementSummary,
  getNearGameKindFromPreview,
  getNearResultForHole,
  upsertNearResult,
  type NearGameKind,
  type NearResult,
} from "../src/lib/betting/near";
import {
  calculateOecdSettlementSummary,
  calculateOecdStatusesForHole,
  getOecdStatusLabel,
  upsertOecdPenalty,
} from "../src/lib/betting/oecd";
import ExportRoundScoreButton from "./components/ExportRoundScoreButton";
import MedalPrizeSummaryCard from "./components/MedalPrizeSummaryCard";
import FinalScorecardExportCard from "./components/FinalScorecardExportCard";
import PrizeAmountRankingCard from "./components/PrizeAmountRankingCard";

const STORAGE_KEY = "roundpot.refactored.withSchool.v1";

const DEFAULT_PARS: Array<3 | 4 | 5> = [
  4, 4, 3, 5, 4, 4, 5, 3, 4,
  4, 4, 3, 5, 4, 4, 5, 3, 4,
];

const DEFAULT_PLAYER_NAMES = ["로리맥길로이", "넬리코다", "최경주", "김효주"];

type SavedRoundState = {
  hasStarted: boolean;
  courseName: string;
  holeCount: 9 | 18;
  holePars: Array<3 | 4 | 5>;
  holeHandicapRanks: Array<number | null>;
  playerNames: string[];
  playerHandicaps: PlayerHandicapSettings[];
  settings: BettingSettingsV2;
  players: Player[];
  holes: Hole[];
  scores: Score[];
  currentHoleIndex: number;
  vegasTeamAssignments: TeamAssignment[];
  husseinAssignments: HusseinAssignment[];
  manualFirstHusseinPlayerId: string;
  manualVegasTeamAssignments: ManualVegasTeamAssignment[];
  nearEnabled: boolean;
  nearAmount: number;
  nearResults: NearResult[];
  oecdPenalties: HoleOecdPenalty[];
  savedAt: string;
};

type ManualVegasTeamAssignment = {
  holeId: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
};

type RoundView =
  | "play"
  | "latest-result"
  | "settlement"
  | "scorecard"
  | "pool"
  | "final-share";

type ActiveCalculation = {
  gameResult: GameResult;
  currentGamePreview: CurrentGamePreview | null;
  latestResult: ReturnType<typeof getLatestGameResult> | null;
  strokeBet: ReturnType<typeof calculateStrokeBet> | null;
  poolSummary: {
    totalPool: number;
    contributionPerPlayer: number;
    poolCollected: number;
    poolPaid: number;
    remainingCarryOver: number;
    firstPrizeCarryOver?: number;
    secondPrizeCarryOver?: number;
    schoolLabel?: string;
  } | null;
};

function normalizeHolePars(
  pars: Array<3 | 4 | 5>,
  holeCount: 9 | 18
): Array<3 | 4 | 5> {
  return Array.from({ length: holeCount }, (_, index) => {
    const par = pars[index] ?? DEFAULT_PARS[index] ?? 4;
    return par === 3 || par === 4 || par === 5 ? par : 4;
  });
}

function createHoles(
  holeCount: 9 | 18,
  pars: Array<3 | 4 | 5>,
  handicapRanks: Array<number | null>
): Hole[] {
  const normalizedPars = normalizeHolePars(pars, holeCount);
  const normalizedHandicapRanks = normalizeHoleHandicapRanks(
    handicapRanks,
    holeCount
  );

  return Array.from({ length: holeCount }, (_, index) => ({
    id: `h${index + 1}`,
    holeNumber: index + 1,
    par: normalizedPars[index],
    handicapRank: normalizedHandicapRanks[index],
  }));
}

const createDefaultHoleHandicapRanks = (
  holeCount: 9 | 18
): Array<number | null> => Array.from({ length: holeCount }, () => null);

const normalizeHoleHandicapRanks = (
  ranks: Array<number | null | undefined>,
  holeCount: 9 | 18
  ): Array<number | null> =>
  Array.from({ length: holeCount }, (_, index) => {
    const rank = ranks[index];

    if (
      typeof rank === "number" &&
      Number.isInteger(rank) &&
      rank >= 1 &&
      rank <= holeCount
    ) {
      return rank;
    }

    return null;
  });

const createDefaultPlayerHandicap = (): PlayerHandicapSettings => ({
  enabled: false,
  parValues: [],
  topHandicapHoleCount: 0,
});

const createDefaultPlayerHandicaps = (): PlayerHandicapSettings[] =>
  DEFAULT_PLAYER_NAMES.map(() => createDefaultPlayerHandicap());

const normalizePlayerHandicap = (
  handicap: PlayerHandicapSettings | null | undefined
): PlayerHandicapSettings => ({
  enabled: handicap?.enabled ?? false,
  parValues: Array.isArray(handicap?.parValues) ? handicap.parValues : [],
  topHandicapHoleCount: handicap?.topHandicapHoleCount ?? 0,
});

function parseParValuesFromText(text: string): Array<3 | 4 | 5> {
  const normalizedText = text
    .replaceAll("파", "")
    .replaceAll("홀", "")
    .replaceAll("번", "")
    .replaceAll(" ", "")
    .replaceAll("-", "")
    .replaceAll(".", "")
    .replaceAll(",", "")
    .replaceAll("/", "")
    .replaceAll("|", "");

  const digitMap: Record<string, 3 | 4 | 5> = {
    "3": 3,
    "4": 4,
    "5": 5,
    "３": 3,
    "４": 4,
    "５": 5,
    삼: 3,
    사: 4,
    오: 5,
    셋: 3,
    넷: 4,
    다섯: 5,
    三: 3,
    四: 4,
    五: 5,
  };

  const result: Array<3 | 4 | 5> = [];

  let index = 0;
  while (index < normalizedText.length) {
    const twoChar = normalizedText.slice(index, index + 2);
    const oneChar = normalizedText[index];

    if (digitMap[twoChar]) {
      result.push(digitMap[twoChar]);
      index += 2;
      continue;
    }

    if (digitMap[oneChar]) {
      result.push(digitMap[oneChar]);
    }

    index += 1;
  }

  return result;
}

function formatParsForText(pars: Array<3 | 4 | 5>): string {
  return pars.join(" ");
}

function createInitialScores(players: Player[], holes: Hole[]): Score[] {
  return holes.flatMap((hole) =>
    players.map((player) => ({
      holeId: hole.id,
      playerId: player.id,
      strokes: null,
    }))
  );
}

function isValidHoleCount(value: unknown): value is 9 | 18 {
  return value === 9 || value === 18;
}

function formatPlainAmount(amount: number): string {
  return `${amount.toLocaleString()}원`;
}

function formatScoreToPar(scoreToPar: number): string {
  if (scoreToPar > 0) return `+${scoreToPar}`;
  if (scoreToPar < 0) return `${scoreToPar}`;
  return "0";
}

function getScoreObject(scores: Score[], holeId: string, playerId: string) {
  return scores.find((score) => score.holeId === holeId && score.playerId === playerId);
}

function getDisplayScoreToPar(scores: Score[], hole: Hole, playerId: string) {
  const score = getScoreObject(scores, hole.id, playerId);
  const strokes = score?.strokes ?? hole.par;
  return strokes - hole.par;
}

function getSavedScoreToPar(scores: Score[], hole: Hole, playerId: string) {
  const score = getScoreObject(scores, hole.id, playerId);
  if (score?.strokes === null || score?.strokes === undefined) return null;
  return score.strokes - hole.par;
}

function getPlayerScoreTotalToPar(params: {
  scores: Score[];
  holes: Hole[];
  playerId: string;
  fromHoleNumber: number;
  toHoleNumber: number;
}) {
  const { scores, holes, playerId, fromHoleNumber, toHoleNumber } = params;

  let total = 0;
  let hasAnySavedScore = false;

  const targetHoles = holes.filter(
    (hole) => hole.holeNumber >= fromHoleNumber && hole.holeNumber <= toHoleNumber
  );

  for (const hole of targetHoles) {
    const scoreToPar = getSavedScoreToPar(scores, hole, playerId);

    if (scoreToPar === null) {
      continue;
    }

    total += scoreToPar;
    hasAnySavedScore = true;
  }

  return hasAnySavedScore ? total : null;
}

function getBettingScoresWithHandicap(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
}): Score[] {
  const { players, holes, scores } = params;

  const playerById = new Map(players.map((player) => [player.id, player]));
  const holeById = new Map(holes.map((hole) => [hole.id, hole]));

  return scores.map((score) => {
    if (score.strokes === null || score.strokes === undefined) {
      return score;
    }

    const player = playerById.get(score.playerId);
    const hole = holeById.get(score.holeId);

    if (!player || !hole) {
      return score;
    }

    const adjustment = getHandicapStrokeForHole(player, hole);

    if (adjustment <= 0) {
      return score;
    }

    return {
      ...score,
      strokes: Math.max(1, score.strokes - adjustment),
    };
  });
}

function formatHandicapSummary(settings: PlayerHandicapSettings): string {
  if (!settings.enabled) return "핸디 없음";

  const parts: string[] = [];

  if (settings.parValues.length > 0) {
    parts.push(`파 ${settings.parValues.join("/")}`);
  } else {
    parts.push("모든 Par");
  }

  if (settings.topHandicapHoleCount > 0) {
    parts.push(`핸디캡 상위 ${settings.topHandicapHoleCount}개 홀`);
  } else {
    parts.push("전체 홀");
  }

  return parts.join(" · ");
}

function buildRankRows<T extends { id: string; amount: number }>(items: T[]) {
  const sorted = items
    .slice()
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  let previousAmount: number | null = null;
  let previousRank = 0;

  return sorted.map((item, index) => {
    const rank = previousAmount === item.amount ? previousRank : index + 1;
    previousAmount = item.amount;
    previousRank = rank;

    return {
      ...item,
      rank,
    };
  });
}

function buildNearPrizeRows(params: {
  players: Player[];
  nearSettlementSummary: ReturnType<typeof calculateNearSettlementSummary>;
}) {
  const { players, nearSettlementSummary } = params;

  const byPlayer = new Map(
    nearSettlementSummary.players.map((summary) => [summary.playerId, summary])
  );

  return players.map((player) => ({
    id: player.id,
    name: player.name,
    amount: byPlayer.get(player.id)?.totalAmount ?? 0,
  }));
}

function cloneVegasAssignmentToHole(params: {
  assignment: TeamAssignment;
  nextHole: Hole;
}): TeamAssignment {
  const { assignment, nextHole } = params;

  return {
    ...assignment,
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    teams: [
      {
        ...assignment.teams[0],
        playerIds: [...assignment.teams[0].playerIds],
      },
      {
        ...assignment.teams[1],
        playerIds: [...assignment.teams[1].playerIds],
      },
    ],
    reason: "동점 이월로 이전 홀 팀 유지",
  };
}

function cloneHusseinAssignmentToHole(params: {
  assignment: HusseinAssignment;
  nextHole: Hole;
}): HusseinAssignment {
  const { assignment, nextHole } = params;

  return {
    ...assignment,
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    reason: "동점 이월로 이전 홀 구성 유지",
  };
}

function upsertVegasTeamAssignment(
  assignments: TeamAssignment[],
  nextAssignment: TeamAssignment
): TeamAssignment[] {
  const existingIndex = assignments.findIndex(
    (assignment) => assignment.holeId === nextAssignment.holeId
  );

  if (existingIndex === -1) {
    return [...assignments, nextAssignment];
  }

  return assignments.map((assignment, index) =>
    index === existingIndex ? nextAssignment : assignment
  );
}

function upsertHusseinAssignment(
  assignments: HusseinAssignment[],
  nextAssignment: HusseinAssignment
): HusseinAssignment[] {
  const existingIndex = assignments.findIndex(
    (assignment) => assignment.holeId === nextAssignment.holeId
  );

  if (existingIndex === -1) {
    return [...assignments, nextAssignment];
  }

  return assignments.map((assignment, index) =>
    index === existingIndex ? nextAssignment : assignment
  );
}

function normalizePlayerHandicaps(
  handicaps: PlayerHandicapSettings[] | undefined,
  playerCount: number
): PlayerHandicapSettings[] {
  return Array.from({ length: playerCount }, (_, index) =>
    normalizePlayerHandicap(handicaps?.[index])
  );
}

function isSkinsDisplayResult(
  mode: BettingMode,
  result: { gameType: string; title: string } & SkinsLatestResultDisplay
) {
  return mode === "skins" || result.innerGameType === "skins";
}

function isVegasDisplayResult(
  mode: BettingMode,
  result: { gameType: string; title: string } & VegasLatestResultDisplay
) {
  return mode === "vegas" || result.innerGameType === "vegas";
}

function isHusseinDisplayResult(
  mode: BettingMode,
  result: { gameType: string; title: string } & HusseinLatestResultDisplay
) {
  return mode === "hussein" || result.innerGameType === "hussein";
}

function getSchoolCurrentLabel(params: {
  result: SchoolLatestResultDisplay;
  firstBaseAmount: number;
  secondBaseAmount: number;
}) {
  const { result, firstBaseAmount, secondBaseAmount } = params;

  const firstCarryCount =
    firstBaseAmount > 0
      ? Math.round((result.firstPrizeCarriedIn ?? 0) / firstBaseAmount)
      : 0;
  const secondCarryCount =
    secondBaseAmount > 0
      ? Math.round((result.secondPrizeCarriedIn ?? 0) / secondBaseAmount)
      : 0;

  return `${firstCarryCount + 1}학년 ${secondCarryCount + 1}반`;
}

function getModeLabel(mode: BettingMode): string {
  if (mode === "stroke") return "스트로크";
  if (mode === "skins") return "스킨스";
  if (mode === "vegas") return "라스베가스";
  if (mode === "hussein") return "후세인";
  if (mode === "school") return "학교";
  return "순환게임";
}

function getInitialSettings(): BettingSettingsV2 {
  if (typeof structuredClone === "function") {
    return structuredClone(DEFAULT_BETTING_SETTINGS);
  }

  return JSON.parse(JSON.stringify(DEFAULT_BETTING_SETTINGS)) as BettingSettingsV2;
}

function activateMode(settings: BettingSettingsV2, mode: BettingMode): BettingSettingsV2 {
  return {
    ...settings,
    mode,
    stroke: {
      ...settings.stroke,
      enabled: mode === "stroke",
    },
    skins: {
      ...settings.skins,
      enabled: mode === "skins",
    },
    vegas: {
      ...settings.vegas,
      enabled: mode === "vegas",
    },
    hussein: {
      ...settings.hussein,
      enabled: mode === "hussein",
    },
    school: {
      ...settings.school,
      enabled: mode === "school",
    },
    cycle: {
      ...settings.cycle,
      enabled: mode === "cycle",
    },
  };
}

function ensureSettingsShape(settings: BettingSettingsV2 | undefined): BettingSettingsV2 {
  const defaults = getInitialSettings();

  if (!settings) {
    return activateMode(defaults, "skins");
  }

  return activateMode(
    {
      ...defaults,
      ...settings,
      stroke: { ...defaults.stroke, ...settings.stroke },
      skins: { ...defaults.skins, ...settings.skins },
      vegas: {
        ...defaults.vegas,
        ...settings.vegas,
        teamAssignmentMode: settings.vegas?.teamAssignmentMode ?? "auto",
      },
      hussein: { ...defaults.hussein, ...settings.hussein },
      school: { ...defaults.school, ...settings.school },
      cycle: { ...defaults.cycle, ...settings.cycle },
      oecd: { ...defaults.oecd, ...settings.oecd },
    },
    settings.mode ?? "skins"
  );
}

function getActiveCalculation(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: BettingSettingsV2;
  vegasTeamAssignments: TeamAssignment[];
  husseinAssignments: HusseinAssignment[];
}): ActiveCalculation | null {
  const {
    players,
    holes,
    scores,
    settings,
    vegasTeamAssignments,
    husseinAssignments,
  } = params;

  if (players.length === 0 || holes.length === 0) return null;

  const bettingScores = getBettingScoresWithHandicap({
  players,
  holes,
  scores,
});

  if (settings.mode === "stroke") {
    const strokeSettings = { ...settings.stroke, enabled: true };
    const strokeBet = calculateStrokeBet({
      players,
      holes,
      scores: bettingScores,
      settings: strokeSettings,
    });
    const gameResult = calculateStrokeGameResult({
      players,
      holes,
      scores: bettingScores,
      settings: strokeSettings,
    });
    const latestResult = getLatestStrokeResult(gameResult);

    return {
      gameResult,
      currentGamePreview: getStrokeCurrentGamePreview({
        players,
        holes,
        scores: bettingScores,
        settings: strokeSettings,
      }),
      latestResult,
      strokeBet,
      poolSummary: null,
    };
  }

  if (settings.mode === "skins") {
    const skinsSettings = { ...settings.skins, enabled: true };
    const gameResult = calculateSkinsBet({
      players,
      holes,
      scores: bettingScores,
      settings: skinsSettings,
    });

    return {
      gameResult,
      currentGamePreview: getSkinsCurrentGamePreview({
        players,
        holes,
        scores: bettingScores,
        settings: skinsSettings,
      }),
      latestResult: getLatestGameResult(gameResult),
      strokeBet: null,
      poolSummary: getSkinsPoolSummary({
        playerCount: players.length,
        holeCount: holes.length,
        settings: skinsSettings,
        result: gameResult,
      }),
    };
  }

  if (settings.mode === "vegas") {
    const vegasSettings = { ...settings.vegas, enabled: true };
    const gameResult = calculateVegasBet({
      players,
      holes,
      scores: bettingScores,
      settings: vegasSettings,
      teamAssignments: vegasTeamAssignments,
    });

    return {
      gameResult,
      currentGamePreview: getVegasCurrentGamePreview({
        players,
        holes,
        scores: bettingScores,
        settings: vegasSettings,
        teamAssignments: vegasTeamAssignments,
      }),
      latestResult: getLatestGameResult(gameResult),
      strokeBet: null,
      poolSummary: getVegasPoolSummary({
        playerCount: players.length,
        holeCount: holes.length,
        settings: vegasSettings,
        result: gameResult,
      }),
    };
  }

  if (settings.mode === "hussein") {
    const husseinSettings = { ...settings.hussein, enabled: true };
    const gameResult = calculateHusseinBet({
      players,
      holes,
      scores: bettingScores,
      settings: husseinSettings,
      assignments: husseinAssignments,
    });

    return {
      gameResult,
      currentGamePreview: getHusseinCurrentGamePreview({
        players,
        holes,
        scores: bettingScores,
        settings: husseinSettings,
        assignments: husseinAssignments,
      }),
      latestResult: getLatestGameResult(gameResult),
      strokeBet: null,
      poolSummary: getHusseinPoolSummary({
        playerCount: players.length,
        holeCount: holes.length,
        settings: husseinSettings,
        result: gameResult,
      }),
    };
  }

  if (settings.mode === "school") {
    const schoolSettings = { ...settings.school, enabled: true };
    const gameResult = calculateSchoolBet({
      players,
      holes,
      scores: bettingScores,
      settings: schoolSettings,
    });

    return {
      gameResult,
      currentGamePreview: getSchoolCurrentGamePreview({
        players,
        holes,
        scores: bettingScores,
        settings: schoolSettings,
      }),
      latestResult: getLatestGameResult(gameResult),
      strokeBet: null,
      poolSummary: getSchoolPoolSummary({
        playerCount: players.length,
        holeCount: holes.length,
        settings: schoolSettings,
        result: gameResult,
      }),
    };
  }

  const cycleSettings = { ...settings.cycle, enabled: true };
  const gameResult = calculateCycleBet({
    players,
    holes,
    scores: bettingScores,
    settings: cycleSettings,
    vegasTeamAssignments,
    husseinAssignments,
  });

  return {
    gameResult,
    currentGamePreview: getCycleCurrentGamePreview({
      players,
      holes,
      scores: bettingScores,
      settings: cycleSettings,
      vegasTeamAssignments,
      husseinAssignments,
    }),
    latestResult: getLatestGameResult(gameResult),
    strokeBet: null,
    poolSummary: getCyclePoolSummary({
      playerCount: players.length,
      holeCount: holes.length,
      settings: cycleSettings,
      result: gameResult,
    }),
  };
}

type LatestResultDisplay = NonNullable<ActiveCalculation["latestResult"]> & {
  innerGameType?: "skins" | "hussein" | "vegas";
};

type SkinsLatestResultDisplay = LatestResultDisplay & {
  skinsPlayerIds?: string[];
  skinsScore?: number | null;
  skinsResultType?: "win" | "tie";
};

type HusseinLatestResultDisplay = LatestResultDisplay & {
  husseinPlayerId?: string;
  restPlayerIds?: string[];
  husseinWinnerType?: "hussein" | "rest" | "tie";
  husseinPlayerScore?: number;
  restBestScore?: number;
  restTotalScore?: number;
};

type VegasLatestResultDisplay = LatestResultDisplay & {
  teamAPlayerIds?: string[];
  teamBPlayerIds?: string[];
  teamAScore?: number;
  teamBScore?: number;
  winnerTeamId?: "A" | "B" | null;
};

function getScoresBeforeHole(params: {
  scores: Score[];
  holes: Hole[];
  targetHoleNumber: number;
}): Score[] {
  const { scores, holes, targetHoleNumber } = params;
  const holeById = new Map(holes.map((hole) => [hole.id, hole]));

  return scores.map((score) => {
    const hole = holeById.get(score.holeId);

    if (!hole || hole.holeNumber < targetHoleNumber) {
      return score;
    }

    return { ...score, strokes: null };
  });
}

function getOecdSettingsForSettlement(settings: BettingSettingsV2) {
  return {
    ...settings.oecd,
    penaltyDestination:
      settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot",
  };
}

function getCumulativePrizeTotalsBeforeHole(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: BettingSettingsV2;
  vegasTeamAssignments: TeamAssignment[];
  husseinAssignments: HusseinAssignment[];
  nearEnabled: boolean;
  nearAmount: number;
  nearResults: NearResult[];
  oecdPenalties: HoleOecdPenalty[];
  targetHoleNumber: number;
}): Record<string, number> {
  const scoresBeforeHole = getScoresBeforeHole({
    scores: params.scores,
    holes: params.holes,
    targetHoleNumber: params.targetHoleNumber,
  });

  const calculationBeforeHole = getActiveCalculation({
    players: params.players,
    holes: params.holes,
    scores: scoresBeforeHole,
    settings: params.settings,
    vegasTeamAssignments: params.vegasTeamAssignments,
    husseinAssignments: params.husseinAssignments,
  });

  const gameTotals = calculationBeforeHole
    ? calculateSettlementSummary({
        players: params.players,
        gameResults: { [params.settings.mode]: calculationBeforeHole.gameResult },
        strokeBet: calculationBeforeHole.strokeBet,
      })
    : null;

  const nearBeforeHole = calculateNearSettlementSummary({
    playerIds: params.players.map((player) => player.id),
    nearEnabled: params.nearEnabled,
    nearAmount: params.nearAmount,
    nearResults: params.nearResults.filter(
      (result) => result.holeNumber < params.targetHoleNumber
    ),
    vegasTeamAssignments: params.vegasTeamAssignments,
    nearHoleCount: 4,
  });

  const oecdBeforeHole = calculateOecdSettlementSummary({
    players: params.players,
    penalties: params.oecdPenalties.filter(
      (penalty) => penalty.holeNumber < params.targetHoleNumber
    ),
    settings: getOecdSettingsForSettlement(params.settings),
    gameResult: calculationBeforeHole?.gameResult ?? null,
  });

  return params.players.reduce<Record<string, number>>((acc, player) => {
    const gameTotal =
      gameTotals?.players.find((summary) => summary.playerId === player.id)
        ?.totalPrizeAmount ?? 0;
    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;
    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;

    acc[player.id] = gameTotal + nearTotal + oecdTotal;
    return acc;
  }, {});
}

function getCumulativePrizeTotalsByHoleNumber(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: BettingSettingsV2;
  vegasTeamAssignments: TeamAssignment[];
  husseinAssignments: HusseinAssignment[];
  nearEnabled: boolean;
  nearAmount: number;
  nearResults: NearResult[];
  oecdPenalties: HoleOecdPenalty[];
}): Record<number, Record<string, number>> {
  const result: Record<number, Record<string, number>> = {};

  for (const hole of params.holes) {
    result[hole.holeNumber] = getCumulativePrizeTotalsBeforeHole({
      ...params,
      targetHoleNumber: hole.holeNumber,
    });
  }

  return result;
}

function getGameModeLabel(mode: BettingMode): string {
  switch (mode) {
    case "stroke":
      return "스트로크";
    case "skins":
      return "스킨스";
    case "vegas":
      return "라스베가스";
    case "hussein":
      return "후세인";
    case "school":
      return "학교";
    case "cycle":
      return "순환게임";
    default:
      return "내기";
  }
}

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [courseName, setCourseName] = useState("테스트 CC");
  const [holeCount, setHoleCount] = useState<9 | 18>(9);
  const [holePars, setHolePars] = useState<Array<3 | 4 | 5>>(
    DEFAULT_PARS.slice(0, 9)
  );
  const [holeHandicapText, setHoleHandicapText] = useState("");
  const [holeHandicapRanks, setHoleHandicapRanks] = useState<Array<number | null>>(
    createDefaultHoleHandicapRanks(9)
  );
  const [playerNames, setPlayerNames] = useState(DEFAULT_PLAYER_NAMES);
  const [playerHandicaps, setPlayerHandicaps] = useState<PlayerHandicapSettings[]>(
    createDefaultPlayerHandicaps()
  );
  const [settings, setSettings] = useState<BettingSettingsV2>(() =>
    ensureSettingsShape(undefined)
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [scores, setScores] = useState<Score[]>([]);

  const exportPlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
  }));

  const exportHoles = holes
    .slice()
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .map((hole) => ({
      holeNo: hole.holeNumber,
      scores: Object.fromEntries(
        players.map((player) => {
          const score = scores.find(
            (item) => item.holeId === hole.id && item.playerId === player.id,
          );

          return [player.id, score?.strokes ?? null];
        }),
      ),
    }));
    
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [roundView, setRoundView] = useState<RoundView>("play");
  const [vegasTeamAssignments, setVegasTeamAssignments] = useState<TeamAssignment[]>([]);
  const [manualVegasTeamAPlayerIds, setManualVegasTeamAPlayerIds] = useState<
    string[]
  >([]);
  const [manualVegasTeamAssignments, setManualVegasTeamAssignments] = useState<
    ManualVegasTeamAssignment[]
  >([]);
  const [husseinAssignments, setHusseinAssignments] = useState<HusseinAssignment[]>([]);
  const [manualFirstHusseinPlayerId, setManualFirstHusseinPlayerId] =
  useState<string>("");
  const [vegasDrawAnimation, setVegasDrawAnimation] = useState<VegasDrawAnimation | null>(null);
  const [nearEnabled, setNearEnabled] = useState(false);
  const [nearAmount, setNearAmount] = useState(5000);
  const [nearResults, setNearResults] = useState<NearResult[]>([]);
  const [oecdPenalties, setOecdPenalties] = useState<HoleOecdPenalty[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsLoaded(true);
        return;
      }

      const saved = JSON.parse(raw) as Partial<SavedRoundState>;

      setHasStarted(Boolean(saved.hasStarted));
      setCourseName(typeof saved.courseName === "string" ? saved.courseName : "테스트 CC");
      const savedHoleCount = isValidHoleCount(saved.holeCount) ? saved.holeCount : 9;
      setHoleCount(savedHoleCount);
      const nextHolePars = normalizeHolePars(
        Array.isArray(saved.holePars) ? saved.holePars : DEFAULT_PARS.slice(0, savedHoleCount),
        savedHoleCount
      );
      setHolePars(nextHolePars);
      const savedHandicapRanks = normalizeHoleHandicapRanks(
        Array.isArray(saved.holeHandicapRanks)
          ? saved.holeHandicapRanks
          : createDefaultHoleHandicapRanks(savedHoleCount),
        savedHoleCount
      );
      setHoleHandicapRanks(savedHandicapRanks);
      setHoleHandicapText(
        savedHandicapRanks.every((rank) => rank === null)
          ? ""
          : savedHandicapRanks.map((rank) => rank ?? "").join(" ")
      );
      setPlayerNames(
        Array.isArray(saved.playerNames) && saved.playerNames.length > 0
          ? saved.playerNames
          : DEFAULT_PLAYER_NAMES
      );
      setPlayerHandicaps(
        normalizePlayerHandicaps(saved.playerHandicaps, DEFAULT_PLAYER_NAMES.length)
      );
      setSettings(ensureSettingsShape(saved.settings));
      setPlayers(Array.isArray(saved.players) ? saved.players : []);
      setHoles(Array.isArray(saved.holes) ? saved.holes : []);
      setScores(Array.isArray(saved.scores) ? saved.scores : []);
      setCurrentHoleIndex(typeof saved.currentHoleIndex === "number" ? saved.currentHoleIndex : 0);
      setVegasTeamAssignments(
        Array.isArray(saved.vegasTeamAssignments) ? saved.vegasTeamAssignments : []
      );
      setManualVegasTeamAssignments(
        Array.isArray(saved.manualVegasTeamAssignments)
          ? saved.manualVegasTeamAssignments
          : []
      );
      setHusseinAssignments(
        Array.isArray(saved.husseinAssignments) ? saved.husseinAssignments : []
      );
      setManualFirstHusseinPlayerId(
        typeof saved.manualFirstHusseinPlayerId === "string"
          ? saved.manualFirstHusseinPlayerId
          : ""
      );
      setNearEnabled(Boolean(saved.nearEnabled));
      setNearAmount(typeof saved.nearAmount === "number" ? saved.nearAmount : 5000);
      setNearResults(Array.isArray(saved.nearResults) ? saved.nearResults : []);
      setOecdPenalties(Array.isArray(saved.oecdPenalties) ? saved.oecdPenalties : []);
    } catch {
      // 저장 데이터가 깨졌을 경우 기본값으로 계속 진행합니다.
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const savedAt = new Date().toISOString();
    const payload: SavedRoundState = {
      hasStarted,
      courseName,
      holeCount,
      holePars,
      holeHandicapRanks,
      playerNames,
      playerHandicaps,
      settings,
      players,
      holes,
      scores,
      currentHoleIndex,
      vegasTeamAssignments,
      manualVegasTeamAssignments,
      husseinAssignments,
      manualFirstHusseinPlayerId,
      nearEnabled,
      nearAmount,
      nearResults,
      oecdPenalties,
      savedAt,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setLastSavedAt(savedAt);
     }, [
    isLoaded,
    hasStarted,
    courseName,
    holeCount,
    holePars,
    holeHandicapRanks,
    playerNames,
    playerHandicaps,
    settings,
    players,
    holes,
    scores,
    currentHoleIndex,
    vegasTeamAssignments,
    manualVegasTeamAssignments,
    husseinAssignments,
    manualFirstHusseinPlayerId,
    nearEnabled,
    nearAmount,
    nearResults,
    oecdPenalties,
    ]);

  useEffect(() => {
    if (!hasStarted) return;

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    });
  }, [currentHoleIndex, roundView, hasStarted]);

  const activeCalculation = useMemo(
    () =>
      getActiveCalculation({
        players,
        holes,
        scores,
        settings,
        vegasTeamAssignments,
        husseinAssignments,
      }),
    [players, holes, scores, settings, vegasTeamAssignments, husseinAssignments]
  );

  const settlementSummary = useMemo(() => {
    if (!activeCalculation) return null;

    return calculateSettlementSummary({
      players,
      gameResults: {
        [settings.mode]: activeCalculation.gameResult,
      },
      strokeBet: activeCalculation.strokeBet,
    });
  }, [activeCalculation, players, settings.mode]);

  const nearSettlementSummary = useMemo(
  () =>
    calculateNearSettlementSummary({
      playerIds: players.map((player) => player.id),
      nearEnabled,
      nearAmount,
      nearResults,
      vegasTeamAssignments,
      nearHoleCount: 4,
    }),
  [players, nearEnabled, nearAmount, nearResults, vegasTeamAssignments]
  );

  const oecdSettlementSummary = useMemo(
    () =>
      calculateOecdSettlementSummary({
        players,
        penalties: oecdPenalties,
        settings: getOecdSettingsForSettlement(settings),
        gameResult: activeCalculation?.gameResult ?? null,
      }),
    [players, oecdPenalties, settings, activeCalculation]
  );

  const roundSummaryText =
    settlementSummary === null
      ? ""
      : buildRoundSummaryText({
          courseName,
          gameModeLabel: getGameModeLabel(settings.mode),
          holeCount,
          players: settlementSummary.players.map((summary) => {
            const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];
            const nearTotalAmount = nearSettlement?.totalAmount ?? 0;
            const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;

            return {
              playerId: summary.playerId,
              playerName: summary.playerName,
              totalAmount: summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount,
            };
          }),
          nearPlayers: nearSettlementSummary.players.map((summary) => ({
            playerId: summary.playerId,
            playerName: getPlayerName(players, summary.playerId),
            totalAmount: summary.totalAmount,
            breakdowns: summary.breakdowns,
          })),
        });

  const currentHole = holes[currentHoleIndex];

  const cumulativeBeforeHoleByNumber = useMemo(
    () =>
      getCumulativePrizeTotalsByHoleNumber({
        players,
        holes,
        scores,
        settings,
        vegasTeamAssignments,
        husseinAssignments,
        nearEnabled,
        nearAmount,
        nearResults,
        oecdPenalties,
      }),
    [
      players,
      holes,
      scores,
      settings,
      vegasTeamAssignments,
      husseinAssignments,
      nearEnabled,
      nearAmount,
      nearResults,
      oecdPenalties,
    ]
  );

  const currentOecdStatuses = useMemo<OecdPlayerStatus[]>(() => {
    if (!currentHole) return [];

    return calculateOecdStatusesForHole({
      players,
      holes,
      currentHole,
      cumulativeBeforeHoleByPlayer:
        cumulativeBeforeHoleByNumber[currentHole.holeNumber] ?? {},
      cumulativeBeforeHoleByNumber,
      settings: settings.oecd,
    });
  }, [players, holes, currentHole, cumulativeBeforeHoleByNumber, settings.oecd]);

  function updatePlayerName(index: number, value: string) {
    setPlayerNames((prev) =>
      prev.map((name, currentIndex) => (currentIndex === index ? value : name))
    );
  }

  function clearDefaultPlayerNameOnFocus(index: number) {
    setPlayerNames((prev) =>
      prev.map((name, currentIndex) => {
        if (currentIndex !== index) {
          return name;
        }

        if (name === "로리맥길로이" || name === "넬리코다" || name === "최경주" || name === "김효주") {
          return "";
        }

        return name;
      })
    );
  }

  function updateHolePar(index: number, value: 3 | 4 | 5) {
    setHolePars((prev) =>
      normalizeHolePars(
        prev.map((par, currentIndex) => (currentIndex === index ? value : par)),
        holeCount
      )
    );
  }

  function updateHoleHandicapText(value: string) {
    setHoleHandicapText(value);

    const numbers = value
      .split(/[\s,./|]+/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item));

    if (numbers.length !== holeCount) {
      return;
    }

    const uniqueNumbers = new Set(numbers);
    const isValid =
      uniqueNumbers.size === holeCount &&
      numbers.every((item) => item >= 1 && item <= holeCount);

    if (!isValid) {
      return;
    }

    setHoleHandicapRanks(numbers);
  }

  function applyDefaultHoleHandicapRanks() {
    const nextRanks = Array.from({ length: holeCount }, (_, index) => index + 1);

    setHoleHandicapRanks(nextRanks);
    setHoleHandicapText(nextRanks.join(" "));
  }

  function clearHoleHandicapRanks() {
    const nextRanks = createDefaultHoleHandicapRanks(holeCount);

    setHoleHandicapRanks(nextRanks);
    setHoleHandicapText("");
  }

  function updatePlayerHandicap(index: number, value: PlayerHandicapSettings) {
    setPlayerHandicaps((prev) =>
      normalizePlayerHandicaps(
        prev.map((item, currentIndex) =>
          currentIndex === index ? normalizePlayerHandicap(value) : item
        ),
        playerNames.length
      )
    );
  }

  function updateSettings<K extends keyof BettingSettingsV2>(
    key: K,
    value: Partial<BettingSettingsV2[K]>
  ) {
    setSettings((prev) =>
      ensureSettingsShape({
        ...prev,
        [key]: {
          ...prev[key],
          ...value,
        },
      })
    );
  }

  function selectMode(mode: BettingMode) {
    setSettings((prev) => activateMode(prev, mode));
  }

  function updateScoreToPar(hole: Hole, playerId: string, scoreToPar: number) {
    setScores((prev) =>
      prev.map((score) => {
        if (score.holeId !== hole.id || score.playerId !== playerId) return score;
        return {
          ...score,
          strokes: Math.max(1, hole.par + scoreToPar),
        };
      })
    );
  }

function updateNearWinner(params: {
  hole: Hole;
  gameKind: NearGameKind;
  winnerPlayerId: string | null;
}) {
  const { hole, gameKind, winnerPlayerId } = params;

  setNearResults((prev) =>
    upsertNearResult(prev, {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameKind,
      winnerPlayerId,
    })
  );
}

function updateOecdPenalty(penalty: HoleOecdPenalty) {
  setOecdPenalties((prev) => upsertOecdPenalty(prev, penalty));
}

function getManualVegasTeamAssignmentForHole(holeId: string) {
  return manualVegasTeamAssignments.find(
    (assignment) => assignment.holeId === holeId
  ) ?? null;
}

function updateManualVegasTeamAForHole(holeId: string, teamAPlayerIds: string[]) {
  setManualVegasTeamAssignments((prev) => {
    const current = prev.find((assignment) => assignment.holeId === holeId);
    const normalizedTeamA = teamAPlayerIds.slice(0, 2);
    const teamBPlayerIds = players
      .map((player) => player.id)
      .filter((playerId) => !normalizedTeamA.includes(playerId));

    const nextAssignment: ManualVegasTeamAssignment = {
      holeId,
      teamAPlayerIds: normalizedTeamA,
      teamBPlayerIds,
    };

    if (!current) return [...prev, nextAssignment];

    return prev.map((assignment) =>
      assignment.holeId === holeId ? nextAssignment : assignment
    );
  });
}

  function startRound() {
    const normalizedNames = playerNames.map((name) => name.trim()).filter(Boolean);

    if (normalizedNames.length !== 4) {
      alert("4명의 플레이어 이름을 입력해 주세요.");
      return;
    }

    const normalizedHandicaps = normalizePlayerHandicaps(
      playerHandicaps,
      normalizedNames.length
    );

    const nextPlayers = normalizedNames.map((name, index) => ({
      id: `p${index + 1}`,
      name,
      order: index,
      handicap: normalizedHandicaps[index],
    }));
    const nextHoles = createHoles(holeCount, holePars, holeHandicapRanks);

    setPlayerNames(normalizedNames);
    setPlayerHandicaps(normalizedHandicaps);
    setPlayers(nextPlayers);
    setHoles(nextHoles);
    setScores(createInitialScores(nextPlayers, nextHoles));
    setCurrentHoleIndex(0);
    setVegasTeamAssignments([]);
    setManualVegasTeamAPlayerIds([]);
    setManualVegasTeamAssignments([]);
    setHusseinAssignments([]);
    setManualFirstHusseinPlayerId("");
    setNearResults([]);
    setOecdPenalties([]);
    setRoundView("play");
    setHasStarted(true);
  }

  function resetRound() {
    if (!window.confirm("현재 라운드 데이터를 모두 삭제할까요?")) return;

    window.localStorage.removeItem(STORAGE_KEY);
    setHasStarted(false);
    setCourseName("테스트 CC");
    setHoleCount(9);
    setHolePars(DEFAULT_PARS.slice(0, 9));
    setHoleHandicapRanks(createDefaultHoleHandicapRanks(9));
    setHoleHandicapText("");
    setPlayerNames(DEFAULT_PLAYER_NAMES);
    setPlayerHandicaps(createDefaultPlayerHandicaps());
    setSettings(ensureSettingsShape(undefined));
    setPlayers([]);
    setHoles([]);
    setScores([]);
    setCurrentHoleIndex(0);
    setRoundView("play");
    setVegasTeamAssignments([]);
    setManualVegasTeamAPlayerIds([]);
    setManualVegasTeamAssignments([]);
    setHusseinAssignments([]);
    setManualFirstHusseinPlayerId("");
    setNearEnabled(false);
    setNearAmount(5000);
    setNearResults([]);
    setOecdPenalties([]);
    setLastSavedAt(null);
  }

function createHusseinAssignmentFromMode(hole: Hole, forcedPlayerId?: string) {
  if (forcedPlayerId) {
    return createHusseinAssignment({
      hole,
      players,
      holes,
      scores,
      settings: { ...settings.hussein, enabled: true },
      assignments: husseinAssignments,
      forcedPlayerId,
    });
  }

  return createHusseinAssignment({
    hole,
    players,
    holes,
    scores,
    settings: { ...settings.hussein, enabled: true },
    assignments: husseinAssignments,
  });
}

function getSavedStrokesForPlayer(holeId: string, playerId: string): number | null {
  const score = scores.find(
    (item) => item.holeId === holeId && item.playerId === playerId
  );

  return score?.strokes ?? null;
}

function areAllScoresSavedForHole(hole: Hole): boolean {
  return players.every(
    (player) => getSavedStrokesForPlayer(hole.id, player.id) !== null
  );
}

function isCurrentHusseinTieAfterSave(hole: Hole): boolean {
  const assignment =
    husseinAssignments.find((item) => item.holeId === hole.id) ??
    createHusseinAssignmentFromMode(hole);

  if (!assignment) return false;

  const husseinScore = getSavedStrokesForPlayer(
    hole.id,
    assignment.husseinPlayerId
  );

  const restScores = players
    .filter((player) => player.id !== assignment.husseinPlayerId)
    .map((player) => getSavedStrokesForPlayer(hole.id, player.id));

  if (husseinScore === null || restScores.some((score) => score === null)) {
    return false;
  }

  const numericRestStrokes = restScores.filter(
    (score): score is number => typeof score === "number"
  );

  const husseinStrokes = husseinScore;

  const husseinCompareScore =
    settings.hussein.compareMode === "bestScore"
      ? husseinStrokes
      : husseinStrokes * 3;

  const restCompareScore =
    settings.hussein.compareMode === "bestScore"
      ? Math.min(...numericRestStrokes)
      : numericRestStrokes.reduce((sum, value) => sum + value, 0);

  return husseinCompareScore === restCompareScore;
}

function cloneVegasAssignmentToHole(params: {
  assignment: TeamAssignment;
  nextHole: Hole;
}): TeamAssignment {
  const { assignment, nextHole } = params;

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    teams: [
      {
        ...assignment.teams[0],
        playerIds: [...assignment.teams[0].playerIds],
      },
      {
        ...assignment.teams[1],
        playerIds: [...assignment.teams[1].playerIds],
      },
    ],
    reason: "동점 이월로 이전 홀 팀 유지",
  };
}

function cloneHusseinAssignmentToHole(params: {
  assignment: HusseinAssignment;
  nextHole: Hole;
}): HusseinAssignment {
  const { assignment, nextHole } = params;

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    husseinPlayerId: assignment.husseinPlayerId,
    reason: "동점 이월로 이전 홀 구성 유지",
  };
}

function upsertVegasTeamAssignment(
  assignments: TeamAssignment[],
  nextAssignment: TeamAssignment
): TeamAssignment[] {
  const existingIndex = assignments.findIndex(
    (assignment) => assignment.holeId === nextAssignment.holeId
  );

  if (existingIndex === -1) {
    return [...assignments, nextAssignment];
  }

  return assignments.map((assignment, index) =>
    index === existingIndex ? nextAssignment : assignment
  );
}

function upsertHusseinAssignment(
  assignments: HusseinAssignment[],
  nextAssignment: HusseinAssignment
): HusseinAssignment[] {
  const existingIndex = assignments.findIndex(
    (assignment) => assignment.holeId === nextAssignment.holeId
  );

  if (existingIndex === -1) {
    return [...assignments, nextAssignment];
  }

  return assignments.map((assignment, index) =>
    index === existingIndex ? nextAssignment : assignment
  );
}

function saveCurrentHoleAndShowResult() {
  if (!currentHole) return;

  const nextHole = holes[currentHoleIndex + 1] ?? null;

  const nextScores = scores.map((score) => {
    if (score.holeId !== currentHole.id) return score;

    return {
      ...score,
      strokes: score.strokes ?? currentHole.par,
    };
  });

  const nextBettingScores = getBettingScoresWithHandicap({
    players,
    holes,
    scores: nextScores,
  });

  function finishSave() {
    setScores(nextScores);
    setRoundView("latest-result");
  }

  if (settings.mode === "vegas") {
    const storedAssignment =
      vegasTeamAssignments.find(
        (assignment) => assignment.holeId === currentHole.id
      ) ?? null;

    const manualAssignment =
      getManualVegasTeamAssignmentForHole(currentHole.id);

    const shouldUseManualAssignment =
      storedAssignment === null &&
      (settings.vegas.teamAssignmentMode === "manual" ||
        shouldManuallySelectFirstVegasTeams) &&
      manualAssignment !== null &&
      manualAssignment.teamAPlayerIds.length === 2 &&
      manualAssignment.teamBPlayerIds.length === 2;

    if (
      storedAssignment === null &&
      (settings.vegas.teamAssignmentMode === "manual" ||
        shouldManuallySelectFirstVegasTeams) &&
      !shouldUseManualAssignment
    ) {
      alert(
        shouldManuallySelectFirstVegasTeams
          ? "1번 홀 라스베가스 팀 A 2명을 선택해 주세요."
          : "라스베가스 팀 A를 2명 선택해 주세요."
      );
      return;
    }

    const assignment: TeamAssignment =
      storedAssignment ??
      (shouldUseManualAssignment
        ? {
            holeId: currentHole.id,
            holeNumber: currentHole.holeNumber,
            teams: [
              {
                id: "A",
                name: "팀 A",
                playerIds: manualAssignment.teamAPlayerIds,
              },
              {
                id: "B",
                name: "팀 B",
                playerIds: manualAssignment.teamBPlayerIds,
              },
            ],
            reason: "직접 입력",
          }
        : createVegasTeamAssignment({
            hole: currentHole,
            players,
            holes,
            scores: nextBettingScores,
            settings: { ...settings.vegas, enabled: true },
            teamAssignments: vegasTeamAssignments,
          }));

    const assignmentsWithCurrentHole = upsertVegasTeamAssignment(
      vegasTeamAssignments,
      assignment
    );

    const vegasResultWithCurrentHole = calculateVegasBet({
      players,
      holes,
      scores: nextBettingScores,
      settings: { ...settings.vegas, enabled: true },
      teamAssignments: assignmentsWithCurrentHole,
    });

    const currentHoleResult =
      vegasResultWithCurrentHole.holeResults.find(
        (result) => result.holeId === currentHole.id
      ) ?? null;

    const carryAssignment =
      currentHoleResult?.winnerType === "none" && nextHole
        ? cloneVegasAssignmentToHole({
            assignment,
            nextHole,
          })
        : null;

    setVegasTeamAssignments(
      carryAssignment
        ? upsertVegasTeamAssignment(assignmentsWithCurrentHole, carryAssignment)
        : assignmentsWithCurrentHole
    );

    finishSave();
    return;
  }

  if (settings.mode === "hussein") {
    const storedAssignment =
      husseinAssignments.find((assignment) => assignment.holeId === currentHole.id) ??
      null;

    const forcedPlayerId =
      currentHole.holeNumber === 1 ? manualFirstHusseinPlayerId : undefined;
    const assignment = storedAssignment ?? createHusseinAssignmentFromMode(currentHole, forcedPlayerId);

    if (!assignment) {
      alert("후세인을 선택해 주세요.");
      return;
    }

    const assignmentsWithCurrentHole = upsertHusseinAssignment(
      husseinAssignments,
      assignment
    );

    const isTie = isCurrentHusseinTieAfterSave(currentHole);
    const carryAssignment =
      isTie && nextHole
        ? cloneHusseinAssignmentToHole({
            assignment,
            nextHole,
          })
        : null;

    setHusseinAssignments(
      carryAssignment
        ? upsertHusseinAssignment(assignmentsWithCurrentHole, carryAssignment)
        : assignmentsWithCurrentHole
    );

    finishSave();
    return;
  }

  setScores(nextScores);
  setRoundView("latest-result");
}

function returnToPlay() {
  const firstIncompleteHoleIndex = getFirstIncompleteHoleIndex(
    players,
    holes,
    scores
  );

  if (firstIncompleteHoleIndex !== null) {
    setCurrentHoleIndex(firstIncompleteHoleIndex);
  }

  setRoundView("play");
}

function goToNextHoleFromResult() {
  returnToPlay();
}

function goToNextHole() {
  if (currentHoleIndex >= holeCount - 1) {
    setRoundView("final-share");
    return;
  }

  const currentHole = holes[currentHoleIndex];
  const nextHole = holes[currentHoleIndex + 1];
  const latestResult = activeCalculation?.latestResult ?? null;

  const shouldCarryTeamAssignment =
    latestResult?.isCarryOver === true ||
    latestResult?.winnerType === "none";

  if (shouldCarryTeamAssignment && currentHole && nextHole) {
    if (settings.mode === "vegas") {
      const currentAssignment = vegasTeamAssignments.find(
        (assignment) => assignment.holeId === currentHole.id
      );

      if (currentAssignment) {
        const nextAssignment = cloneVegasAssignmentToHole({
          assignment: currentAssignment,
          nextHole,
        });

        setVegasTeamAssignments((prev) =>
          upsertVegasTeamAssignment(prev, nextAssignment)
        );
      }
    }

    if (settings.mode === "hussein") {
      const currentAssignment = husseinAssignments.find(
        (assignment) => assignment.holeId === currentHole.id
      );

      if (currentAssignment) {
        const nextAssignment = cloneHusseinAssignmentToHole({
          assignment: currentAssignment,
          nextHole,
        });

        setHusseinAssignments((prev) =>
          upsertHusseinAssignment(prev, nextAssignment)
        );
      }
    }
  }

  setCurrentHoleIndex((prev) => prev + 1);
  setRoundView("play");
}

  function updatePlayerCount(count: number) {
    setPlayerNames((prev) => {
      const next = Array.from({ length: count }, (_, index) =>
        prev[index] ?? DEFAULT_PLAYER_NAMES[index] ?? `플레이어 ${index + 1}`
      );
      return next;
    });
    setPlayerHandicaps((prev) => normalizePlayerHandicaps(prev, count));
  }

  function updateHoleCount(count: 9 | 18) {
    setHoleCount(count);
    setHolePars((prev) => normalizeHolePars(prev, count));
    setHoleHandicapRanks((prev) => normalizeHoleHandicapRanks(prev, count));
    setHoleHandicapText((prev) => {
      const normalized = normalizeHoleHandicapRanks(
        prev
          .split(/[\s,./|]+/)
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isInteger(item)),
        count
      );

      return normalized.every((rank) => rank === null)
        ? ""
        : normalized.map((rank) => rank ?? "").join(" ");
    });
  }

  const latestResult = activeCalculation?.latestResult ?? null;
  const isLastHole = currentHoleIndex === holes.length - 1;

  const latestHandicapAdjustments: HandicapScoreAdjustment[] = useMemo(() => {
    if (!latestResult) {
      return [];
    }

    const latestHole = holes.find(
      (hole) => hole.id === latestResult.holeId
    );

    if (!latestHole) {
      return [];
    }

    return getHandicapScoreAdjustmentsForHole({
      players,
      hole: latestHole,
      scores,
    });
  }, [latestResult, holes, players, scores]);
  const latestNearResult = useMemo(() => {
    if (!latestResult || !nearEnabled) {
      return null;
    }

    return getNearResultForHole(nearResults, latestResult.holeId);
  }, [latestResult, nearEnabled, nearResults]);

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-4 text-neutral-900">
        <div className="rounded-2xl bg-white p-5 text-center shadow-sm">
          <p className="font-semibold">저장된 라운드를 불러오는 중...</p>
        </div>
      </main>
    );
  }

  if (!hasStarted) {
    const selectedPlayerCount = Math.max(1, playerNames.filter((name) => name.trim()).length);
    const oecdEntryFeePerPlayer = (() => {
      if (settings.mode === "skins") return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount;
      if (settings.mode === "vegas") return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount;
      if (settings.mode === "hussein") return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount;
      if (settings.mode === "school") {
        return ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) / selectedPlayerCount;
      }
      if (settings.mode === "cycle") {
        return (settings.cycle.skinsAmount + settings.cycle.husseinAmount + settings.cycle.vegasAmount) / selectedPlayerCount;
      }
      return 0;
    })();

    return (
      <main className="min-h-screen bg-neutral-100 p-4 text-neutral-900">
        <div className="mx-auto max-w-md space-y-4">
          <header className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">라운드팟 MVP</p>
            <h1 className="text-2xl font-bold">새 라운드 설정</h1>
            <p className="mt-2 text-sm text-neutral-600">
              내기 방식을 하나 선택하고 해당 옵션을 설정합니다.
            </p>
            <p className="mt-3 text-xs text-neutral-400">
              {lastSavedAt ? `마지막 저장: ${new Date(lastSavedAt).toLocaleString()}` : "아직 저장된 라운드 없음"}
            </p>
          </header>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">라운드 기본 정보</h2>
            <label className="mt-4 block text-sm font-medium text-neutral-700">
              골프장 / 라운드명
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
            />

            <label className="mt-4 block text-sm font-medium text-neutral-700">
              홀 수
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[9, 18].map((count) => (
                <button
                  key={count}
                  className={`rounded-xl px-4 py-3 font-bold ${
                    holeCount === count ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
                  }`}
                  onClick={() => updateHoleCount(count as 9 | 18)}
                >
                  {count}홀
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">홀별 Par 설정</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  각 홀의 기준 타수를 입력합니다.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold"
                onClick={() => setHolePars(normalizeHolePars(DEFAULT_PARS, holeCount))}
              >
                기본값
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {Array.from({ length: holeCount }, (_, index) => (
                <div key={`par-${index}`} className="rounded-xl bg-neutral-50 p-2">
                  <p className="text-xs font-semibold text-neutral-500">
                    {index + 1}번 홀
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {[3, 4, 5].map((par) => (
                      <button
                        key={par}
                        type="button"
                        className={`rounded-lg py-2 text-xs font-bold ${
                          holePars[index] === par
                            ? "bg-neutral-900 text-white"
                            : "bg-white text-neutral-700"
                        }`}
                        onClick={() => updateHolePar(index, par as 3 | 4 | 5)}
                      >
                        {par}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">홀 핸디캡 설정</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  핸디캡 난이도 순위를 1번 홀부터 순서대로 입력합니다. 비워두면 홀 핸디캡 조건은 적용하지 않습니다.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold"
                onClick={applyDefaultHoleHandicapRanks}
              >
                1~{holeCount}
              </button>
            </div>

            <textarea
              className="mt-4 min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm outline-none focus:border-neutral-900"
              value={holeHandicapText}
              onChange={(event) => updateHoleHandicapText(event.target.value)}
              placeholder={
                holeCount === 9
                  ? "예: 1 2 3 4 5 6 7 8 9"
                  : "예: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18"
              }
            />

            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-500">
              <span>
                현재 설정: {holeHandicapRanks.every((rank) => rank === null)
                  ? "없음"
                  : holeHandicapRanks.map((rank) => rank ?? "-").join(" ")}
              </span>
              <button
                type="button"
                className="rounded-lg bg-neutral-100 px-3 py-2 font-semibold text-neutral-700"
                onClick={clearHoleHandicapRanks}
              >
                지우기
              </button>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">플레이어</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  현재 내기 계산은 4인 플레이 기준입니다.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 text-sm font-bold">
                {[4].map((count) => (
                  <button
                    key={count}
                    className="rounded-lg bg-white px-3 py-2"
                    onClick={() => updatePlayerCount(count)}
                  >
                    {count}명
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {playerNames.map((name, index) => (
                <input
                  key={index}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                  value={name}
                  onChange={(event) => updatePlayerName(index, event.target.value)}
                  onFocus={() => clearDefaultPlayerNameOnFocus(index)}
                  placeholder={`플레이어 ${index + 1}`}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">개인 핸디캡</h2>
            <p className="mt-1 text-sm text-neutral-500">
              조건에 해당하는 홀에서는 내기 계산에만 1타를 차감합니다. 스코어카드 원타수는 그대로 유지됩니다.
            </p>

            <div className="mt-4 space-y-3">
              {playerNames.map((name, index) => {
                const handicap = playerHandicaps[index] ?? createDefaultPlayerHandicap();

                return (
                  <div key={`handicap-${index}`} className="rounded-2xl bg-neutral-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold">{name || `플레이어 ${index + 1}`}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {formatHandicapSummary(handicap)}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        사용
                        <input
                          type="checkbox"
                          checked={handicap.enabled}
                          onChange={(event) =>
                            updatePlayerHandicap(index, {
                              ...handicap,
                              enabled: event.target.checked,
                            })
                          }
                        />
                      </label>
                    </div>

                    <fieldset className="mt-3" disabled={!handicap.enabled}>
                      <p className="text-xs font-semibold text-neutral-500">적용 Par</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[3, 4, 5].map((par) => {
                          const checked = handicap.parValues.includes(par as HandicapParValue);

                          return (
                            <button
                              key={par}
                              type="button"
                              className={`rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-40 ${
                                checked ? "bg-neutral-900 text-white" : "bg-white text-neutral-700"
                              }`}
                              onClick={() => {
                                const nextParValues = checked
                                  ? handicap.parValues.filter((value) => value !== par)
                                  : [...handicap.parValues, par as HandicapParValue];

                                updatePlayerHandicap(index, {
                                  ...handicap,
                                  parValues: nextParValues,
                                });
                              }}
                            >
                              Par {par}
                            </button>
                          );
                        })}
                      </div>

                      <label className="mt-3 block text-xs font-semibold text-neutral-500">
                        핸디캡 상위 N개 홀
                      </label>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-100"
                        min={0}
                        max={holeCount}
                        value={handicap.topHandicapHoleCount}
                        onChange={(event) =>
                          updatePlayerHandicap(index, {
                            ...handicap,
                            topHandicapHoleCount: Math.max(0, Number(event.target.value || 0)),
                          })
                        }
                      />
                    </fieldset>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">내기 방식</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {([
                ["skins", "스킨스"],
                ["vegas", "라스베가스"],
                ["hussein", "후세인"],
                ["school", "학교"],
                ["stroke", "스트로크"],
                ["cycle", "순환게임"],
              ] as Array<[BettingMode, string]>).map(([mode, label]) => (
                <button
                  key={mode}
                  className={`rounded-xl px-3 py-3 font-bold ${
                    settings.mode === mode ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
                  }`}
                  onClick={() => selectMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {settings.mode === "stroke" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">스트로크 옵션</h2>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                타당 금액
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.stroke.amountPerStroke}
                onChange={(event) =>
                  updateSettings("stroke", {
                    amountPerStroke: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />
            </section>
          )}

          {settings.mode === "skins" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">스킨스 옵션</h2>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                홀당 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.skins.amountPerHole}
                onChange={(event) =>
                  updateSettings("skins", {
                    amountPerHole: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />
              <label className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <span className="font-medium">동점 시 이월</span>
                <input
                  type="checkbox"
                  checked={settings.skins.carryOverEnabled}
                  onChange={(event) =>
                    updateSettings("skins", { carryOverEnabled: event.target.checked })
                  }
                />
              </label>
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">사전 모금</p>
                <p>사전 총액: {formatPlainAmount(settings.skins.amountPerHole * holeCount)}</p>
                <p>1인 선납 예상: {formatPlainAmount((settings.skins.amountPerHole * holeCount) / selectedPlayerCount)}</p>
              </div>
            </section>
          )}

          {settings.mode === "vegas" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">라스베가스 옵션</h2>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                홀당 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.vegas.amountPerHole}
                onChange={(event) =>
                  updateSettings("vegas", {
                    amountPerHole: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />
              <label className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <span className="font-medium">동점 시 이월</span>
                <input
                  type="checkbox"
                  checked={settings.vegas.carryOverEnabled}
                  onChange={(event) =>
                    updateSettings("vegas", { carryOverEnabled: event.target.checked })
                  }
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                팀 구성 방식
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["previousRanks", "전 홀 성적 1·4등 vs 2·3등"],
                  ["randomAfterHole", "홀 종료 후 랜덤 드로우"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      settings.vegas.teamMode === value
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-700"
                    }`}
                    onClick={() => updateSettings("vegas", { teamMode: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                팀 입력 방식
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["auto", "자동 결정"],
                  ["manual", "직접 입력"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      (settings.vegas.teamAssignmentMode ?? "auto") === value
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-700"
                    }`}
                    onClick={() => updateSettings("vegas", { teamAssignmentMode: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">사전 모금</p>
                <p>사전 총액: {formatPlainAmount(settings.vegas.amountPerHole * holeCount)}</p>
                <p>1인 선납 예상: {formatPlainAmount((settings.vegas.amountPerHole * holeCount) / selectedPlayerCount)}</p>
              </div>
            </section>
          )}

          {settings.mode === "hussein" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">후세인 옵션</h2>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                홀당 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.hussein.amountPerHole}
                onChange={(event) =>
                  updateSettings("hussein", {
                    amountPerHole: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />
              <label className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <span className="font-medium">동점 시 이월</span>
                <input
                  type="checkbox"
                  checked={settings.hussein.carryOverEnabled}
                  onChange={(event) =>
                    updateSettings("hussein", { carryOverEnabled: event.target.checked })
                  }
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                후세인 선정 기준
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["previousFirst", "전 홀 1등"],
                  ["previousSecond", "전 홀 2등"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      settings.hussein.selector === value
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-700"
                    }`}
                    onClick={() => updateSettings("hussein", { selector: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                비교 방식
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["bestScore", "후세인 1명 vs 3명팀 베스트 스코어"],
                  ["tripleSum", "후세인 점수×3 vs 3명팀 합산"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      settings.hussein.compareMode === value
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-700"
                    }`}
                    onClick={() => updateSettings("hussein", { compareMode: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">사전 모금</p>
                <p>사전 총액: {formatPlainAmount(settings.hussein.amountPerHole * holeCount)}</p>
                <p>1인 선납 예상: {formatPlainAmount((settings.hussein.amountPerHole * holeCount) / selectedPlayerCount)}</p>
              </div>
            </section>
          )}

          {settings.mode === "school" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">학교 옵션</h2>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                1등 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.school.firstPrizeAmount}
                onChange={(event) =>
                  updateSettings("school", {
                    firstPrizeAmount: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                2등 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.school.secondPrizeAmount}
                onChange={(event) =>
                  updateSettings("school", {
                    secondPrizeAmount: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />
              <label className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
                <span className="font-medium">동점 시 이월</span>
                <input
                  type="checkbox"
                  checked={settings.school.carryOverEnabled}
                  onChange={(event) =>
                    updateSettings("school", { carryOverEnabled: event.target.checked })
                  }
                />
              </label>
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">사전 모금</p>
                <p>사전 총액: {formatPlainAmount((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount)}</p>
                <p>1인 선납 예상: {formatPlainAmount(((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) / selectedPlayerCount)}</p>
              </div>
            </section>
          )}

          {settings.mode === "cycle" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">순환게임 옵션</h2>
              <p className="mt-1 text-sm text-neutral-500">
                스킨스 → 후세인 → 라스베가스를 홀마다 순환합니다. 동점 시
                이월 상태는 예: 3학년 2반처럼 표시됩니다.
              </p>

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                스킨스 기본 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.cycle.skinsAmount}
                onChange={(event) =>
                  updateSettings("cycle", {
                    skinsAmount: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                후세인 기본 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.cycle.husseinAmount}
                onChange={(event) =>
                  updateSettings("cycle", {
                    husseinAmount: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                라스베가스 기본 상금
              </label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                value={settings.cycle.vegasAmount}
                onChange={(event) =>
                  updateSettings("cycle", {
                    vegasAmount: Number(event.target.value || 0),
                  })
                }
                min={0}
                step={1000}
              />

              <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                <p className="text-sm font-bold">동점 처리</p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {([
                    ["carryOnlyNextGame", "상금만 이월하고 다음 게임 진행"],
                    ["carryAndRepeatSameGame", "상금 이월 + 같은 게임 유지"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                        settings.cycle.tieMode === value
                          ? "bg-neutral-900 text-white"
                          : "bg-white text-neutral-700"
                      }`}
                      onClick={() => updateSettings("cycle", { tieMode: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                후세인 선정 기준
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["previousFirst", "전 홀 1등"],
                  ["previousSecond", "전 홀 2등"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      settings.cycle.husseinSelector === value
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-700"
                    }`}
                    onClick={() => updateSettings("cycle", { husseinSelector: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                후세인 비교 방식
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["bestScore", "후세인 1명 vs 3명팀 베스트 스코어"],
                  ["tripleSum", "후세인 점수×3 vs 3명팀 합산"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      settings.cycle.husseinCompareMode === value
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-700"
                    }`}
                    onClick={() => updateSettings("cycle", { husseinCompareMode: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                라스베가스 팀 구성 방식
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {([
                  ["previousRanks", "전 홀 성적 1·4등 vs 2·3등"],
                  ["randomAfterHole", "홀 종료 후 랜덤 드로우"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-left font-bold ${
                      settings.cycle.vegasTeamMode === value
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-700"
                    }`}
                    onClick={() => updateSettings("cycle", { vegasTeamMode: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">사전 모금</p>
                <p>사전 총액: {formatPlainAmount(settings.cycle.skinsAmount + settings.cycle.husseinAmount + settings.cycle.vegasAmount)}</p>
                <p>1인 선납 예상: {formatPlainAmount((settings.cycle.skinsAmount + settings.cycle.husseinAmount + settings.cycle.vegasAmount) / selectedPlayerCount)}</p>
                <p>참고: 실제 이월 여부에 따라 지급 타이밍이 달라집니다.</p>
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">니어 옵션</h2>
            <p className="mt-1 text-sm text-neutral-500">
              니어 상금은 정산에는 반영되지만 내기 게임 승패 계산에는 반영하지 않습니다.
            </p>

            <label className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 p-3">
              <span className="font-medium">니어 사용</span>
              <input
                type="checkbox"
                checked={nearEnabled}
                onChange={(event) => setNearEnabled(event.target.checked)}
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-neutral-700">
              니어 상금
            </label>
            <input
              type="number"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900 disabled:bg-neutral-100"
              value={nearAmount}
              onChange={(event) => setNearAmount(Number(event.target.value || 0))}
              min={0}
              step={1000}
              disabled={!nearEnabled}
            />

            <div className="mt-4 rounded-xl bg-lime-50 p-3 text-sm text-lime-900">
              <p className="font-semibold">지급 방식</p>
              <p>스킨스·후세인·학교·스트로크: 니어 위너 개인에게 지급</p>
              <p>라스베가스: 니어 라스베가스 팀 니어: 위너가 속한 팀원 각각 니어 상금 수령</p>
            </div>
          </section>

          <OecdSettingsCard
            settings={settings.oecd}
            entryFeePerPlayer={oecdEntryFeePerPlayer}
            isSkinsMode={settings.mode === "skins"}
            formatPlainAmount={formatPlainAmount}
            onChange={(value) => updateSettings("oecd", value)}
          />

          <button
            className="w-full rounded-2xl bg-neutral-900 px-5 py-4 text-lg font-bold text-white shadow-sm"
            onClick={startRound}
          >
            라운드 시작
          </button>
        </div>
      </main>
    );
  }

  if (!activeCalculation || !settlementSummary || !currentHole) {
    return null;
  }

  const currentHoleSaved = isHoleSaved(players, scores, currentHole.id);
  const preview = activeCalculation.currentGamePreview;

  const shouldManuallySelectFirstVegasTeams =
    settings.mode === "vegas" &&
    settings.vegas.teamMode === "previousRanks" &&
    settings.vegas.teamAssignmentMode === "auto" &&
    currentHole.holeNumber === 1;
    
  const firstVegasManualTeams: [Team, Team] =
    manualVegasTeamAPlayerIds.length === 2
      ? [
          {
            id: "A",
            name: "팀 A",
            playerIds: manualVegasTeamAPlayerIds,
          },
          {
            id: "B",
            name: "팀 B",
            playerIds: players
              .filter((player) => !manualVegasTeamAPlayerIds.includes(player.id))
              .map((player) => player.id),
          },
        ]
      : [
          {
            id: "A",
            name: "팀 A",
            playerIds: [],
          },
          {
            id: "B",
            name: "팀 B",
            playerIds: [],
          },
        ];

  const currentGamePreviewForDisplay =
    preview && settings.mode === "hussein" && currentHole.holeNumber === 1
      ? {
          ...preview,
          husseinPlayerId: manualFirstHusseinPlayerId || null,
        }
      : preview && shouldManuallySelectFirstVegasTeams
        ? {
            ...preview,
            description:
              manualVegasTeamAPlayerIds.length === 2
                ? "직접 선택한 팀 구성으로 라스베가스를 진행합니다."
                : "1번 홀 팀을 직접 선택해 주세요.",
            teams: firstVegasManualTeams,
          }
        : preview;

  const currentHandicapAdjustments: HandicapScoreAdjustment[] =
  getHandicapScoreAdjustmentsForHole({
    players,
    hole: currentHole,
    scores,
  });

  const currentHandicapEligiblePlayers: HandicapEligiblePlayerForHole[] =
  getHandicapEligiblePlayersForHole({
    players,
    hole: currentHole,
    scores,
  });

  const currentPoolSummary = activeCalculation.poolSummary;

  const prizePoolSection = currentPoolSummary ? (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">상금 풀</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-neutral-500">사전 총액</p>
          <p className="font-bold">{formatPlainAmount(currentPoolSummary.totalPool)}</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-neutral-500">1인 선납</p>
          <p className="font-bold">{formatPlainAmount(currentPoolSummary.contributionPerPlayer)}</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-neutral-500">현재 지급</p>
          <p className="font-bold">{formatPlainAmount(currentPoolSummary.poolPaid)}</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-neutral-500">현재 이월</p>
          <p className="font-bold">{formatPlainAmount(currentPoolSummary.remainingCarryOver)}</p>
        </div>
        {currentPoolSummary.firstPrizeCarryOver !== undefined && (
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-neutral-500">1등 상금 이월</p>
            <p className="font-bold">{formatPlainAmount(currentPoolSummary.firstPrizeCarryOver)}</p>
          </div>
        )}
        {currentPoolSummary.secondPrizeCarryOver !== undefined && (
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-neutral-500">2등 상금 이월</p>
            <p className="font-bold">{formatPlainAmount(currentPoolSummary.secondPrizeCarryOver)}</p>
          </div>
        )}
        {currentPoolSummary.schoolLabel && (
          <div className="col-span-2 rounded-xl bg-amber-50 p-3">
            <p className="text-neutral-500">현재 학교</p>
            <p className="font-bold">{currentPoolSummary.schoolLabel}</p>
          </div>
        )}
      </div>
    </section>
  ) : null;

  const nearSettlementSection = nearSettlementSummary.totalAmount > 0 ? (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">니어 정산</h2>
        <p className="mt-1 text-sm text-neutral-500">
          니어 상금은 총획득 상금에 함께 반영됩니다.
        </p>
        <div className="mt-3 space-y-2">
          {nearSettlementSummary.players
            .filter((summary) => summary.totalAmount > 0)
            .map((summary) => (
              <div key={summary.playerId} className="rounded-xl bg-lime-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {getPlayerName(players, summary.playerId)}
                  </span>
                  <span className="font-bold text-lime-700">
                    {formatAmount(summary.totalAmount)}
                  </span>
                </div>

                {summary.breakdowns.length > 0 && (
                  <p className="mt-1 text-xs text-lime-800">
                    {summary.breakdowns.join(" · ")}
                  </p>
                )}
              </div>
            ))}
        </div>
      </section>
    ) : null;

  const oecdSettlementSection =
    settings.oecd.enabled &&
    (oecdSettlementSummary.totalPenaltyAmount > 0 ||
      oecdSettlementSummary.commonPotAmount > 0 ||
      oecdSettlementSummary.winnerPaidAmount > 0) ? (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">OECD 정산</h2>
        <p className="mt-1 text-sm text-neutral-500">
          수동 입력한 OECD 벌금이 총획득 상금에 반영됩니다.
        </p>
        <div className="mt-3 space-y-2">
          {oecdSettlementSummary.players
            .filter((summary) => summary.totalAmount !== 0)
            .map((summary) => (
              <div key={summary.playerId} className="rounded-xl bg-rose-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{getPlayerName(players, summary.playerId)}</span>
                  <span className="font-bold text-rose-700">{formatAmount(summary.totalAmount)}</span>
                </div>
                {summary.breakdowns.length > 0 && (
                  <p className="mt-1 text-xs text-rose-800">{summary.breakdowns.join(" · ")}</p>
                )}
              </div>
            ))}
        </div>
        {oecdSettlementSummary.commonPotAmount > 0 && (
          <p className="mt-3 text-sm font-semibold text-rose-800">
            공통 pot 적립: {formatPlainAmount(oecdSettlementSummary.commonPotAmount)}
          </p>
        )}
      </section>
    ) : null;

  const strokeSettlementSection =
    activeCalculation.strokeBet && activeCalculation.strokeBet.pairwiseSettlements.length > 0 ? (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">스트로크 정산 상세</h2>
        <div className="mt-3 space-y-2">
          {activeCalculation.strokeBet.pairwiseSettlements.map((item, index) => (
            <div key={index} className="rounded-xl bg-neutral-50 p-3 text-sm">
              <span className="font-medium">{getPlayerName(players, item.fromPlayerId)}</span>
              <span> → </span>
              <span className="font-medium">{getPlayerName(players, item.toPlayerId)}</span>
              <span className="font-bold"> {formatPlainAmount(item.amount)}</span>
              <p className="mt-1 text-xs text-neutral-500">{item.reason}</p>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const returnToPlayButton = (
    <button
      type="button"
      className="w-full rounded-2xl bg-neutral-200 px-5 py-4 text-base font-semibold text-neutral-900"
      onClick={returnToPlay}
    >
      라운드로 돌아가기
    </button>
  );

  const returnToLatestResultButton = (
    <button
      type="button"
      className="w-full rounded-2xl bg-neutral-200 px-5 py-4 text-base font-semibold text-neutral-900"
      onClick={() => setRoundView("latest-result")}
    >
      라운드로 돌아가기
    </button>
  );

  const medalPrizeRows = settlementSummary.players.map((summary) => {
    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];
    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;
    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;
    const totalAmountWithNear =
      summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount;

    return {
      playerId: summary.playerId,
      playerName: summary.playerName,
      amount: totalAmountWithNear,
    };
  });

  const medalPrizeSection = <MedalPrizeSummaryCard rows={medalPrizeRows} />;

  const latestPrizeSection = (
    <PrizeAmountRankingCard
      title="총획득 상금"
      description="현재까지 실제로 획득한 상금 기준입니다."
      rows={medalPrizeRows}
    />
  );

  const otherScreensSection = (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-neutral-500">다른 화면 보기</h2>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          className="w-full rounded-xl bg-neutral-100 px-4 py-3 text-left text-sm font-semibold"
          onClick={() => setRoundView("settlement")}
        >
          현재 상금 보기
        </button>
        <button
          type="button"
          className="w-full rounded-xl bg-neutral-100 px-4 py-3 text-left text-sm font-semibold"
          onClick={() => setRoundView("scorecard")}
        >
          전체 스코어카드 보기
        </button>
        <button
          type="button"
          className="w-full rounded-xl bg-neutral-100 px-4 py-3 text-left text-sm font-semibold"
          onClick={() => setRoundView("pool")}
        >
          상금 풀 보기
        </button>
      </div>
    </section>
  );

  const roundViewTitle: Record<RoundView, string> = {
    play: "라운드 진행",
    "latest-result": "방금 홀 결과",
    settlement: "현재 상금",
    scorecard: "전체 스코어카드",
    pool: "상금 풀",
    "final-share": "최종 정산",
  };

  return (
    <main className="min-h-screen bg-neutral-100 p-4 text-neutral-900">
      <div className="mx-auto max-w-md space-y-4">
        <header className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-neutral-500">{courseName}</p>
              <h1 className="text-2xl font-bold">{roundViewTitle[roundView]}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {currentHole.holeNumber} / {holeCount}홀 · {getModeLabel(settings.mode)}
              </p>
            </div>
            <button
              className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
              onClick={resetRound}
            >
              초기화
            </button>
          </div>
        </header>

        {roundView === "play" && (
          <>
            {prizePoolSection}

{settings.mode === "vegas" &&
  settings.vegas.teamMode === "randomAfterHole" &&
  currentHole.holeNumber > 1 &&
  !vegasTeamAssignments.some(
    (assignment) => assignment.holeId === currentHole.id
  ) && (
  <section className="rounded-2xl bg-amber-50 p-5 shadow-sm">
    <h2 className="text-lg font-bold text-amber-950">라스베가스 랜덤 팀 드로우</h2>
    <p className="mt-1 text-sm text-amber-800">
      이전 홀 결과 확인 후 이번 홀 라스베가스 팀을 랜덤으로 정합니다.
    </p>

    <button
      type="button"
      className="mt-4 w-full rounded-2xl bg-amber-600 px-5 py-4 text-base font-bold text-white shadow-sm"
      onClick={() => {
        const assignment = createVegasTeamAssignment({
          hole: currentHole,
          players,
          holes,
          scores,
          settings: { ...settings.vegas, enabled: true },
          teamAssignments: vegasTeamAssignments,
        });

        setVegasDrawAnimation({
          teamAPlayerIds: [],
          teamBPlayerIds: [],
        });

        window.setTimeout(() => {
          setVegasDrawAnimation({
            teamAPlayerIds: assignment.teams[0].playerIds,
            teamBPlayerIds: assignment.teams[1].playerIds,
          });
          setVegasTeamAssignments((prev) =>
            upsertVegasTeamAssignment(prev, assignment)
          );
        }, 700);
      }}
    >
      랜덤으로 팀 정하기
    </button>

    {vegasDrawAnimation && (
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white p-3">
          <p className="font-semibold text-amber-800">A팀</p>
          <p className="mt-2 font-bold text-amber-950">
            {vegasDrawAnimation.teamAPlayerIds.length > 0
              ? formatTeam(players, vegasDrawAnimation.teamAPlayerIds)
              : "섞는 중..."}
          </p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="font-semibold text-amber-800">B팀</p>
          <p className="mt-2 font-bold text-amber-950">
            {vegasDrawAnimation.teamBPlayerIds.length > 0
              ? formatTeam(players, vegasDrawAnimation.teamBPlayerIds)
              : "섞는 중..."}
          </p>
        </div>
      </div>
    )}
  </section>
)}

        <CurrentGamePreviewCard
          preview={currentGamePreviewForDisplay}
          players={players}
          formatPlainAmount={formatPlainAmount}
          formatTeam={formatTeam}
          getPlayerName={getPlayerName}
          handicapAdjustments={currentHandicapAdjustments}
          handicapEligiblePlayers={currentHandicapEligiblePlayers}
          oecdStatuses={settings.oecd.enabled ? currentOecdStatuses : []}
        />

      {settings.mode === "hussein" &&
        currentHole.holeNumber === 1 &&
        !husseinAssignments.some(
          (assignment) => assignment.holeId === currentHole.id
        ) && (
          <section className="rounded-2xl bg-purple-50 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-purple-950">
              1번 홀 후세인 선택
            </h2>
            <p className="mt-1 text-sm text-purple-800">
              1번 홀 후세인을 직접 선택하세요. 나머지 3명은 3명팀이 됩니다.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {players.map((player) => {
                const isSelected = manualFirstHusseinPlayerId === player.id;

                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`rounded-xl px-3 py-3 text-sm font-bold ${
                      isSelected
                        ? "bg-purple-700 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => setManualFirstHusseinPlayerId(player.id)}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl bg-white p-3 text-sm">
              <p>
                <span className="font-bold">후세인:</span>{" "}
                {manualFirstHusseinPlayerId
                  ? getPlayerName(players, manualFirstHusseinPlayerId)
                  : "선택하세요"}
              </p>
              <p className="mt-1">
                <span className="font-bold">3명팀:</span>{" "}
                {manualFirstHusseinPlayerId
                  ? formatTeam(
                      players,
                      players
                        .filter((player) => player.id !== manualFirstHusseinPlayerId)
                        .map((player) => player.id)
                    )
                  : "후세인 선택 후 자동 지정"}
              </p>
            </div>
          </section>
        )}
        
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-500">현재 홀</p>
              <h2 className="text-xl font-bold">
                {currentHole.holeNumber}번 홀 / Par {currentHole.par}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                {currentHoleSaved ? "저장 완료" : "아직 정산에 반영되지 않음"}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                className="rounded-xl bg-neutral-200 px-3 py-2 text-sm disabled:opacity-40"
                disabled={currentHoleIndex === 0}
                onClick={() => setCurrentHoleIndex((value) => value - 1)}
              >
                이전
              </button>
              <button
                className="rounded-xl bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40"
                disabled={currentHoleIndex === holes.length - 1}
                onClick={() => setCurrentHoleIndex((value) => value + 1)}
              >
                다음
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {players.map((player) => {
              const scoreToPar = getDisplayScoreToPar(scores, currentHole, player.id);
                const oecdStatus = currentOecdStatuses.find(
                  (status) => status.playerId === player.id
                );

                return (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 p-3"
                >
                  <div>
                    <span className="font-medium">{player.name}</span>
                    <p className="text-xs text-neutral-500">
                      {settings.oecd.enabled
                        ? getOecdStatusLabel(oecdStatus)
                        : "OECD 사용 안함"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      className="h-9 w-9 rounded-full bg-neutral-200 text-lg"
                      onClick={() => updateScoreToPar(currentHole, player.id, -1)}
                    >
                      -
                    </button>
                    <span className="w-10 text-center text-xl font-bold">
                      {formatScoreToPar(scoreToPar)}
                    </span>
                    <button
                      className="h-9 w-9 rounded-full bg-neutral-900 text-lg text-white"
                      onClick={() => updateScoreToPar(currentHole, player.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {settings.mode === "vegas" &&
            (settings.vegas.teamAssignmentMode === "manual" ||
              shouldManuallySelectFirstVegasTeams) &&
            !vegasTeamAssignments.some(
              (assignment) => assignment.holeId === currentHole.id
            ) && (
              <section className="rounded-2xl bg-orange-50 p-5 shadow-sm">
                <h2 className="text-lg font-bold text-orange-950">
                  {shouldManuallySelectFirstVegasTeams
                    ? "1번 홀 팀 선택"
                    : "이번 홀 팀 직접 입력"}
                </h2>

                <p className="mt-1 text-sm text-orange-800">
                  {shouldManuallySelectFirstVegasTeams
                    ? "1번 홀 팀을 직접 선택하세요. 팀 A 2명을 선택하면 나머지 2명은 팀 B가 됩니다."
                    : "팀 A 2명을 선택하세요. 나머지 2명은 팀 B가 됩니다."}
                </p>

                {(() => {
                  const manualAssignment =
                    getManualVegasTeamAssignmentForHole(currentHole.id);

                  const teamAPlayerIds = manualAssignment?.teamAPlayerIds ?? [];

                  const teamBPlayerIds = players
                    .map((player) => player.id)
                    .filter((playerId) => !teamAPlayerIds.includes(playerId));

                  return (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {players.map((player) => {
                          const isSelected = teamAPlayerIds.includes(player.id);

                          return (
                            <button
                              key={player.id}
                              type="button"
                              className={`rounded-xl px-3 py-3 text-sm font-bold ${
                                isSelected
                                  ? "bg-orange-700 text-white"
                                  : "bg-white text-orange-900"
                              }`}
                              onClick={() => {
                                let nextTeamAPlayerIds = teamAPlayerIds;

                                if (isSelected) {
                                  nextTeamAPlayerIds = teamAPlayerIds.filter(
                                    (playerId) => playerId !== player.id
                                  );
                                } else if (teamAPlayerIds.length < 2) {
                                  nextTeamAPlayerIds = [...teamAPlayerIds, player.id];
                                }

                                updateManualVegasTeamAForHole(
                                  currentHole.id,
                                  nextTeamAPlayerIds
                                );
                              }}
                            >
                              {player.name}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 rounded-xl bg-white p-3 text-sm">
                        <p>
                          <span className="font-bold">팀 A:</span>{" "}
                          {formatTeam(players, teamAPlayerIds)}
                        </p>
                        <p className="mt-1">
                          <span className="font-bold">팀 B:</span>{" "}
                          {formatTeam(players, teamBPlayerIds)}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </section>
            )}       

          {(() => {
            const nearGameKind = getNearGameKindFromPreview(settings.mode, preview);
            const currentNearResult = getNearResultForHole(nearResults, currentHole.id);

            return (
              <NearWinnerSelector
                enabled={nearEnabled}
                hole={currentHole}
                gameKind={nearGameKind}
                amount={nearAmount}
                players={players}
                currentResult={currentNearResult}
                formatPlainAmount={formatPlainAmount}
                onChangeWinner={(winnerPlayerId) =>
                  updateNearWinner({
                    hole: currentHole,
                    gameKind: nearGameKind,
                    winnerPlayerId,
                  })
                }
              />
            );
          })()}

        </section>

        <OecdPenaltyInputSection
          enabled={settings.oecd.enabled}
          hole={currentHole}
          players={players}
          statuses={currentOecdStatuses}
          penalties={oecdPenalties}
          penaltyUnitAmount={currentGamePreviewForDisplay?.baseAmount ?? 1000}
          formatPlainAmount={formatPlainAmount}
          onChangePenalty={updateOecdPenalty}
        />

        <button
          type="button"
          className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-sm"
          onClick={saveCurrentHoleAndShowResult}
        >
          현재 홀 저장하고 결과 확인
        </button>

        {otherScreensSection}
          </>
        )}

        {roundView === "latest-result" && (
          <>
            <LatestResultSection
              latestResult={latestResult}
              settings={settings}
              players={players}
              formatTeam={formatTeam}
              formatPlainAmount={formatPlainAmount}
              getPlayerName={getPlayerName}
              handicapAdjustments={latestHandicapAdjustments}
              nearResult={latestNearResult}
            />

            {latestPrizeSection}
            {oecdSettlementSection}            

            {isLastHole ? (
              <>
                <button
                  type="button"
                  className="w-full rounded-2xl bg-neutral-900 px-5 py-4 text-base font-bold text-white shadow-sm"
                  onClick={() => setRoundView("final-share")}
                >
                  최종 정산 보기
                </button>

                <ExportRoundScoreButton
                  courseName={courseName} 
                  playedAt={new Date().toISOString().slice(0, 10)}
                  players={exportPlayers}
                  holes={exportHoles}
                />
              </>
            ) : (
              <button
                type="button"
                className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-sm"
                onClick={goToNextHoleFromResult}
              >
                다음 홀로
              </button>
            )}

            {otherScreensSection}

          </>
        )}

        {roundView === "settlement" && (
          <>
            {returnToPlayButton}
            {medalPrizeSection}
            {nearSettlementSection}
          </>
        )}

        {roundView === "scorecard" && (
          <>
            {returnToPlayButton}
            <ScorecardSection
              players={players}
              holes={holes}
              scores={scores}
              holeCount={holeCount}
              getSavedScoreToPar={getSavedScoreToPar}
              getPlayerScoreTotalToPar={getPlayerScoreTotalToPar}
              formatScoreToPar={formatScoreToPar}
            />
          </>
        )}

        {roundView === "pool" && (
          <>
            {returnToPlayButton}
            {prizePoolSection}
          </>
        )}

        {roundView === "final-share" && (
          <>
            {medalPrizeSection}
            {nearSettlementSection}
            {strokeSettlementSection}

            <FinalScorecardExportCard
              courseName={courseName}
              playedAt={new Date().toISOString().slice(0, 10)}
              players={exportPlayers}
              holes={exportHoles}
            />

            {roundSummaryText && <RoundShareCard summaryText={roundSummaryText} />}
            {returnToLatestResultButton}
          </>
        )}
      </div>
    </main>
  );
}
