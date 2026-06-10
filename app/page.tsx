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

    const handicapStroke = getHandicapStrokeForHole({
      handicap: player.handicap,
      hole,
    });

    console.log("HANDICAP CHECK", {
  player: player.name,
  holeNumber: hole.holeNumber,
  par: hole.par,
  handicapRank: hole.handicapRank,
  handicap: player.handicap,
  rawStrokes: score.strokes,
  handicapStroke,
  adjustedStrokes: Math.max(1, score.strokes - handicapStroke),
});
    if (handicapStroke <= 0) {
      return score;
    }

    return {
      ...score,
      strokes: Math.max(1, score.strokes - handicapStroke),
    };
  });
}

function isHoleSaved(players: Player[], scores: Score[], holeId: string) {
  return players.every((player) => {
    const score = getScoreObject(scores, holeId, player.id);
    return score?.strokes !== null && score?.strokes !== undefined;
  });
}

function getFirstIncompleteHoleIndex(
  players: Player[],
  holes: Hole[],
  scores: Score[]
) {
  const index = holes.findIndex((hole) => !isHoleSaved(players, scores, hole.id));

  return index >= 0 ? index : null;
}

function getPlayerName(players: Player[], playerId: string) {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

function formatTeam(players: Player[], playerIds: string[]) {
  return playerIds.map((playerId) => getPlayerName(players, playerId)).join(" · ");
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

type SchoolLatestResultDisplay = {
  firstPrizeAmount?: number;
  secondPrizeAmount?: number;
  firstPrizeWinnerPlayerIds?: string[];
  secondPrizeWinnerPlayerIds?: string[];
  firstPrizeCarriedIn?: number;
  secondPrizeCarriedIn?: number;
  firstPrizeCarriedOut?: number;
  secondPrizeCarriedOut?: number;
};

type VegasLatestResultDisplay = {
  innerGameType?: "skins" | "hussein" | "vegas";
  teamAPlayerIds?: string[];
  teamBPlayerIds?: string[];
  teamAScore?: number;
  teamBScore?: number;
  winnerTeamId?: "A" | "B" | null;
  assignmentReason?: string;
};

type HusseinLatestResultDisplay = {
  innerGameType?: "skins" | "hussein" | "vegas";
  husseinPlayerId?: string;
  husseinPlayerScore?: number;
  restPlayerIds?: string[];
  restBestScore?: number;
  restTotalScore?: number;
  husseinCompareScore?: number;
  restCompareScore?: number;
  husseinWinnerType?: "hussein" | "rest" | "tie";
};

type VegasDrawAnimation = {
  isRunning: boolean;
  holeNumber: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  message: string;
};

type SkinsLatestResultDisplay = {
  innerGameType?: "skins" | "hussein" | "vegas";
  skinsPlayerIds?: string[];
  skinsScore?: number | null;
  skinsResultType?: "win" | "tie";
};

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
    const latestResult = getLatestStrokeResult({
      players,
      holes,
      scores: bettingScores,
      settings: strokeSettings,
    });

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
      latestResult: getLatestGameResult({ skins: gameResult }),
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
      latestResult: getLatestGameResult({ vegas: gameResult }),
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
      husseinAssignments,
    });

    return {
      gameResult,
      currentGamePreview: getHusseinCurrentGamePreview({
        players,
        holes,
        scores: bettingScores,
        settings: husseinSettings,
        husseinAssignments,
      }),
      latestResult: getLatestGameResult({ hussein: gameResult }),
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
      latestResult: getLatestGameResult({ school: gameResult }),
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
    latestResult: getLatestGameResult({ cycle: gameResult }),
    strokeBet: null,
    poolSummary: getCyclePoolSummary({
      playerCount: players.length,
      holeCount: holes.length,
      settings: cycleSettings,
      result: gameResult,
    }),
  };
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
      return mode;
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
  const [parInputText, setParInputText] = useState(formatParsForText(DEFAULT_PARS.slice(0, 9)));
  const [parHelperMessage, setParHelperMessage] = useState(
    "기본 홀별 Par가 들어가 있습니다. 필요하면 직접 수정하거나 텍스트/음성으로 입력하세요."
  );
  const [isListeningPars, setIsListeningPars] = useState(false);

  const [holeHandicapRanks, setHoleHandicapRanks] = useState<Array<number | null>>(
    () => createDefaultHoleHandicapRanks(9)
  );

  const [playerNames, setPlayerNames] = useState(DEFAULT_PLAYER_NAMES);

  const [playerHandicaps, setPlayerHandicaps] = useState<
    PlayerHandicapSettings[]
  >(() => createDefaultPlayerHandicaps());

  const [settings, setSettings] = useState<BettingSettingsV2>(() =>
    activateMode(getInitialSettings(), "skins")
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
      setParInputText(formatParsForText(nextHolePars));      


      const nextHoleHandicapRanks = normalizeHoleHandicapRanks(
        Array.isArray(saved.holeHandicapRanks)
          ? saved.holeHandicapRanks
          : Array.isArray(saved.holes)
            ? saved.holes.map((hole) => hole.handicapRank ?? null)
            : [],
        savedHoleCount
      );

      setHoleHandicapRanks(nextHoleHandicapRanks);

      const nextPlayerNames =
        Array.isArray(saved.playerNames) && saved.playerNames.length > 0
          ? saved.playerNames.slice(0, 4)
          : DEFAULT_PLAYER_NAMES;

      setPlayerNames(nextPlayerNames);

      setPlayerHandicaps(
        nextPlayerNames.map((_, index) =>
          normalizePlayerHandicap(
            Array.isArray(saved.playerHandicaps)
              ? saved.playerHandicaps[index]
              : Array.isArray(saved.players)
                ? saved.players[index]?.handicap
                : null
          )
        )
      );

      setSettings(ensureSettingsShape(saved.settings));

      setPlayers(
        Array.isArray(saved.players)
          ? saved.players.map((player) => ({
              ...player,
              handicap: normalizePlayerHandicap(player.handicap),
            }))
          : []
      );

      setHoles(
        Array.isArray(saved.holes)
          ? saved.holes.map((hole) => ({
              ...hole,
              handicapRank: hole.handicapRank ?? null,
            }))
          : []
      );      
      setScores(Array.isArray(saved.scores) ? saved.scores : []);
      setCurrentHoleIndex(
        Number.isInteger(saved.currentHoleIndex) ? Number(saved.currentHoleIndex) : 0
      );
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
      setNearAmount(
        typeof saved.nearAmount === "number" && saved.nearAmount >= 0
          ? saved.nearAmount
          : 5000
      );
      setNearResults(Array.isArray(saved.nearResults) ? saved.nearResults : []);
      setLastSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
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
  }, [hasStarted, roundView]);

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

            return {
              playerId: summary.playerId,
              playerName: summary.playerName,
              totalAmount: summary.totalPrizeAmount + nearTotalAmount,
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

  function updateHoleHandicapRank(index: number, handicapRank: number | null) {
  setHoleHandicapRanks((prev) => {
    const nextRanks = normalizeHoleHandicapRanks(prev, holeCount);

    nextRanks[index] =
      typeof handicapRank === "number" &&
      Number.isInteger(handicapRank) &&
      handicapRank >= 1 &&
      handicapRank <= holeCount
        ? handicapRank
        : null;

    return nextRanks;
    });
  }

  const updatePlayerHandicap = (
    playerIndex: number,
    updater: (handicap: PlayerHandicapSettings) => PlayerHandicapSettings
  ) => {
    setPlayerHandicaps((prev) =>
      DEFAULT_PLAYER_NAMES.map((_, index) =>
        index === playerIndex
          ? updater(normalizePlayerHandicap(prev[index]))
          : normalizePlayerHandicap(prev[index])
      )
    );
  };

  const togglePlayerHandicapParValue = (
    playerIndex: number,
    parValue: HandicapParValue
  ) => {
    updatePlayerHandicap(playerIndex, (handicap) => {
      const hasParValue = handicap.parValues.includes(parValue);

      return {
        ...handicap,
        parValues: hasParValue
          ? handicap.parValues.filter((value) => value !== parValue)
          : ([...handicap.parValues, parValue] as HandicapParValue[]).sort(
              (a, b) => a - b
            ),
      };
    });
  };


  function updateHoleCount(nextHoleCount: 9 | 18) {
    setHoleCount(nextHoleCount);
    setHolePars((prev) => {
      const nextPars = normalizeHolePars(prev, nextHoleCount);
      setParInputText(formatParsForText(nextPars));
      return nextPars;
    });
    setHoleHandicapRanks((prev) =>
      normalizeHoleHandicapRanks(prev, nextHoleCount)
    );
  }

  function updateHolePar(index: number, par: 3 | 4 | 5) {
    setHolePars((prev) => {
      const nextPars = normalizeHolePars(prev, holeCount);
      nextPars[index] = par;
      setParInputText(formatParsForText(nextPars));
      return nextPars;
    });
  }

  function applyParInputText() {
    const parsedPars = parseParValuesFromText(parInputText);

    if (parsedPars.length < holeCount) {
      setParHelperMessage(
        `${holeCount}개 홀의 Par가 필요합니다. 현재 ${parsedPars.length}개만 인식했습니다.`
      );
      return;
    }

    const nextPars = normalizeHolePars(parsedPars.slice(0, holeCount), holeCount);
    setHolePars(nextPars);
    setParInputText(formatParsForText(nextPars));
    setParHelperMessage(`${holeCount}개 홀의 Par 정보를 반영했습니다.`);
  }

  function startParVoiceInput() {
    const speechWindow = window as unknown as {
      SpeechRecognition?: any;
      webkitSpeechRecognition?: any;
    };
    const SpeechRecognitionConstructor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setParHelperMessage(
        "이 브라우저에서는 앱 내 음성 인식을 지원하지 않습니다. 아이폰에서는 텍스트 입력칸을 터치한 뒤 키보드의 마이크 받아쓰기를 사용하고, 이후 '텍스트 적용'을 눌러 주세요."
      );
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    recognition.continuous = false;
    recognition.interimResults = true;

    setIsListeningPars(true);
    setParHelperMessage("음성 입력을 듣고 있습니다. 예: 사 삼 오 사 사 사 오 ...");

 recognition.onresult = (event: any) => {
  const candidates: string[] = [];

  for (let resultIndex = 0; resultIndex < event.results.length; resultIndex += 1) {
    const result = event.results[resultIndex];

    for (let altIndex = 0; altIndex < result.length; altIndex += 1) {
      const transcript = result[altIndex]?.transcript ?? "";
      if (transcript.trim()) {
        candidates.push(transcript);
      }
    }
  }

  let bestTranscript = "";
  let bestParsedPars: Array<3 | 4 | 5> = [];

  for (const candidate of candidates) {
    const parsed = parseParValuesFromText(candidate);

    if (parsed.length > bestParsedPars.length) {
      bestTranscript = candidate;
      bestParsedPars = parsed;
    }

    if (parsed.length >= holeCount) {
      break;
    }
  }

  if (bestParsedPars.length >= holeCount) {
    const nextPars = normalizeHolePars(bestParsedPars.slice(0, holeCount), holeCount);

    setHolePars(nextPars);
    setParInputText(formatParsForText(nextPars));
    setParHelperMessage(
      `음성에서 ${holeCount}개 홀의 Par 정보를 반영했습니다. 인식값: ${bestTranscript}`
    );
    return;
  }

  if (bestParsedPars.length > 0) {
    setParInputText(formatParsForText(bestParsedPars));

    setHolePars((prev) => {
      const nextPars = normalizeHolePars(prev, holeCount);

      bestParsedPars.forEach((par, index) => {
        if (index < holeCount) {
          nextPars[index] = par;
        }
      });

      return nextPars;
    });

    setParHelperMessage(
      `음성에서 ${bestParsedPars.length}개만 인식했습니다. ${holeCount - bestParsedPars.length}개가 부족합니다. 인식값: ${bestTranscript}`
    );
    return;
  }

  setParHelperMessage(
    "Par 숫자를 인식하지 못했습니다. 예: '파 사, 파 사, 파 삼, 파 오...'처럼 다시 말해 주세요."
  );
};
    recognition.onerror = () => {
      setParHelperMessage("음성 인식 중 오류가 났습니다. 다시 시도하거나 수동 입력을 사용하세요.");
    };

    recognition.onend = () => {
      setIsListeningPars(false);
    };

    recognition.start();
  }

  function handleParImageUpload(file: File | null) {
    if (!file) return;

    setParHelperMessage(
      `${file.name} 파일을 받았습니다. 현재 로컬 MVP에는 사진 OCR 엔진이 아직 연결되어 있지 않아 자동 추출은 다음 단계에서 서버/OCR 기능으로 붙이는 것이 안전합니다. 지금은 사진의 Par 숫자를 텍스트 칸에 붙여넣거나 수동 입력해 주세요.`
    );
  }

  function handleCourseWebLookup() {
    setParHelperMessage(
      "골프장명 기반 웹 자동 조회는 브라우저 보안 정책과 사이트별 구조 차이 때문에 로컬 MVP에서는 안정적으로 직접 수집하기 어렵습니다. 다음 단계에서 서버 API를 붙이면 자동 입력으로 확장할 수 있습니다."
    );
  }

  function updateMode(mode: BettingMode) {
    setSettings((prev) => activateMode(prev, mode));
  }

  function updateSettings<K extends keyof BettingSettingsV2>(
    section: K,
    value: Partial<BettingSettingsV2[K]>
  ) {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as object),
        ...value,
      },
    }));
  }

  function startRound() {
    const trimmedNames = playerNames.map((name) => name.trim()).filter(Boolean);

    if (trimmedNames.length < 2) {
      alert("플레이어는 최소 2명 이상 입력해야 합니다.");
      return;
    }

    if (["vegas", "hussein", "cycle"].includes(settings.mode) && trimmedNames.length !== 4) {
      alert("라스베가스, 후세인, 순환게임은 4명이 있을 때만 사용할 수 있습니다.");
      return;
    }

    const nextPlayers: Player[] = trimmedNames.slice(0, 4).map((name, index) => ({
      id: `p${index + 1}`,
      name,
      order: index + 1,
      handicap: normalizePlayerHandicap(playerHandicaps[index]),
    }));

    const nextHoles = createHoles(holeCount, holePars, holeHandicapRanks);

    const nextScores = createInitialScores(nextPlayers, nextHoles);

    setPlayers(nextPlayers);
    setHoles(nextHoles);
    setScores(nextScores);
    setVegasTeamAssignments([]);
    setManualVegasTeamAssignments([]);
    setHusseinAssignments([]);
    setManualFirstHusseinPlayerId("");
    setNearResults([]);
    setVegasDrawAnimation(null);
    setCurrentHoleIndex(0);
    setRoundView("play");
    setHasStarted(true);
  }

  function resetRound() {
    const confirmed = window.confirm("현재 라운드를 종료하고 새 라운드를 시작할까요? 저장된 진행 내용도 삭제됩니다.");
    if (!confirmed) return;

    window.localStorage.removeItem(STORAGE_KEY);
    setHasStarted(false);
    setCourseName("테스트 CC");
    setHoleCount(9);
    setHolePars(DEFAULT_PARS.slice(0, 9));
    setParInputText(formatParsForText(DEFAULT_PARS.slice(0, 9)));
    setParHelperMessage("기본 홀별 Par가 들어가 있습니다. 필요하면 직접 수정하거나 텍스트/음성으로 입력하세요.");
    setIsListeningPars(false);
    setPlayerNames(DEFAULT_PLAYER_NAMES);
    setHoleHandicapRanks(createDefaultHoleHandicapRanks(9));
    setPlayerHandicaps(createDefaultPlayerHandicaps());
    setSettings(activateMode(getInitialSettings(), "skins"));
    setPlayers([]);
    setHoles([]);
    setScores([]);
    setCurrentHoleIndex(0);
    setRoundView("play");
    setVegasTeamAssignments([]);
    setManualVegasTeamAssignments([]);
    setHusseinAssignments([]);
    setNearEnabled(false);
    setNearAmount(5000);
    setNearResults([]);
    setVegasDrawAnimation(null);
    setLastSavedAt(null);
  }

  function updateScoreToPar(hole: Hole, playerId: string, diff: number) {
    setScores((prevScores) =>
      prevScores.map((score) => {
        if (score.holeId !== hole.id || score.playerId !== playerId) {
          return score;
        }

        const currentStrokes = score.strokes ?? hole.par;
        const nextStrokes = Math.max(1, currentStrokes + diff);

        return {
          ...score,
          strokes: nextStrokes,
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
  upsertNearResult({
    nearResults: prev,
    hole,
    gameKind,
    winnerPlayerId,
    amount: nearAmount,
  })
);
}

function getManualVegasTeamAssignmentForHole(holeId: string) {
  return (
    manualVegasTeamAssignments.find(
      (assignment) => assignment.holeId === holeId
    ) ?? null
  );
}

function updateManualVegasTeamAForHole(holeId: string, teamAPlayerIds: string[]) {
  const normalizedTeamAPlayerIds = teamAPlayerIds.slice(0, 2);
  const teamBPlayerIds = players
    .map((player) => player.id)
    .filter((playerId) => !normalizedTeamAPlayerIds.includes(playerId));

  setManualVegasTeamAssignments((prev) => {
    const nextAssignment: ManualVegasTeamAssignment = {
      holeId,
      teamAPlayerIds: normalizedTeamAPlayerIds,
      teamBPlayerIds,
    };

    const existingIndex = prev.findIndex(
      (assignment) => assignment.holeId === holeId
    );

    if (existingIndex === -1) {
      return [...prev, nextAssignment];
    }

    return prev.map((assignment, index) =>
      index === existingIndex ? nextAssignment : assignment
    );
  });
}

function getScoreStrokesForPlayer(
  scoresToUse: Score[],
  holeId: string,
  playerId: string
): number | null {
  return (
    scoresToUse.find(
      (score) => score.holeId === holeId && score.playerId === playerId
    )?.strokes ?? null
  );
}

function getTeamStrokesForHole(params: {
  teamPlayerIds: string[];
  hole: Hole;
  scoresToUse: Score[];
}): number | null {
  const { teamPlayerIds, hole, scoresToUse } = params;

  let total = 0;

  for (const playerId of teamPlayerIds) {
    const strokes = getScoreStrokesForPlayer(scoresToUse, hole.id, playerId);

    if (strokes === null) {
      return null;
    }

    total += strokes;
  }

  return total;
}

function isVegasAssignmentTie(params: {
  assignment: TeamAssignment;
  hole: Hole;
  scoresToUse: Score[];
}): boolean {
  const { assignment, hole, scoresToUse } = params;

  const teamAScore = getTeamStrokesForHole({
    teamPlayerIds: assignment.teams[0].playerIds,
    hole,
    scoresToUse,
  });

  const teamBScore = getTeamStrokesForHole({
    teamPlayerIds: assignment.teams[1].playerIds,
    hole,
    scoresToUse,
  });

  return teamAScore !== null && teamBScore !== null && teamAScore === teamBScore;
}

function isHusseinAssignmentTie(params: {
  assignment: HusseinAssignment;
  hole: Hole;
  players: Player[];
  scoresToUse: Score[];
}): boolean {
  const { assignment, hole, players, scoresToUse } = params;

  const husseinStrokes = getScoreStrokesForPlayer(
    scoresToUse,
    hole.id,
    assignment.husseinPlayerId
  );

  if (husseinStrokes === null) {
    return false;
  }

  const restPlayerIds = players
    .filter((player) => player.id !== assignment.husseinPlayerId)
    .map((player) => player.id);

  const restStrokes = restPlayerIds.map((playerId) =>
    getScoreStrokesForPlayer(scoresToUse, hole.id, playerId)
  );

  if (restStrokes.some((strokes) => strokes === null)) {
    return false;
  }

  const numericRestStrokes = restStrokes as number[];

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

    const nextVegasTeamAssignments = carryAssignment
      ? upsertVegasTeamAssignment(assignmentsWithCurrentHole, carryAssignment)
      : assignmentsWithCurrentHole;

    const commitVegasAssignments = () => {
      setVegasTeamAssignments(nextVegasTeamAssignments);
    };

    const shouldShowRandomDrawAnimation =
      settings.vegas.teamMode === "randomAfterHole" &&
      storedAssignment === null &&
      !shouldUseManualAssignment;

    if (shouldShowRandomDrawAnimation) {
      setVegasDrawAnimation({
        isRunning: true,
        holeNumber: currentHole.holeNumber,
        teamAPlayerIds: assignment.teams[0].playerIds,
        teamBPlayerIds: assignment.teams[1].playerIds,
        message: "라스베가스 팀 추첨 중...",
      });

      window.setTimeout(() => {
        commitVegasAssignments();
        setScores(nextScores);
        setVegasDrawAnimation({
          isRunning: false,
          holeNumber: currentHole.holeNumber,
          teamAPlayerIds: assignment.teams[0].playerIds,
          teamBPlayerIds: assignment.teams[1].playerIds,
          message: "라스베가스 팀 결정!",
        });

        window.setTimeout(() => {
          setVegasDrawAnimation(null);
          setRoundView("latest-result");
        }, 300);
      }, 300);

      return;
    }

    commitVegasAssignments();
    finishSave();
    return;
  }

  if (settings.mode === "hussein") {
    const carriedHusseinAssignment = husseinAssignments.find(
      (assignment) => assignment.holeId === currentHole.id
    );

    const shouldUseManualFirstHussein =
      currentHole.holeNumber === 1 && manualFirstHusseinPlayerId.length > 0;

    if (
      currentHole.holeNumber === 1 &&
      !carriedHusseinAssignment &&
      !shouldUseManualFirstHussein
    ) {
      alert("1번 홀 후세인을 선택해 주세요.");
      return;
    }

    const assignment: HusseinAssignment = carriedHusseinAssignment
      ? carriedHusseinAssignment
      : shouldUseManualFirstHussein
        ? {
            holeId: currentHole.id,
            holeNumber: currentHole.holeNumber,
            husseinPlayerId: manualFirstHusseinPlayerId,
            reason: "1번 홀 직접 선택",
          }
        : createHusseinAssignment({
            hole: currentHole,
            players,
            holes,
            scores: nextScores,
            settings: { ...settings.hussein, enabled: true },
            husseinAssignments,
          });

    const assignmentsWithCurrentHole = upsertHusseinAssignment(
      husseinAssignments,
      assignment
    );

    const husseinResultWithCurrentHole = calculateHusseinBet({
      players,
      holes,
      scores: nextBettingScores,
      settings: { ...settings.hussein, enabled: true },
      husseinAssignments: assignmentsWithCurrentHole,
    });

    const currentHoleResult =
      husseinResultWithCurrentHole.holeResults.find(
        (result) => result.holeId === currentHole.id
      ) ?? null;

    const carryAssignment =
      currentHoleResult?.winnerType === "none" && nextHole
        ? cloneHusseinAssignmentToHole({
            assignment,
            nextHole,
          })
        : null;

    const nextHusseinAssignments = carryAssignment
      ? upsertHusseinAssignment(assignmentsWithCurrentHole, carryAssignment)
      : assignmentsWithCurrentHole;

    setHusseinAssignments(nextHusseinAssignments);
    finishSave();
    return;
  }

  finishSave();
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

function formatSavedTime(value: string | null) {
  if (!value) return "아직 저장 전";
  const date = new Date(value);
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderModeButton(mode: BettingMode) {
  const active = settings.mode === mode;

  return (
    <button
      key={mode}
      className={`rounded-2xl px-4 py-3 text-sm font-bold ${
        active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
      }`}
      onClick={() => updateMode(mode)}
    >
      {getModeLabel(mode)}
    </button>
  );
}
  const latestResult = activeCalculation?.latestResult ?? null;
  const latestHandicapAdjustments = useMemo<HandicapScoreAdjustment[]>(() => {
    if (!latestResult) {
      return [];
    }

    const latestHole = holes.find(
      (hole) => hole.holeNumber === latestResult.holeNumber
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
              자동 저장: {formatSavedTime(lastSavedAt)}
            </p>
          </header>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">라운드 정보</h2>

            <label className="mt-4 block text-sm font-medium text-neutral-700">
              골프장명
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              placeholder="예: 남서울 CC"
            />

            <div className="mt-4">
              <p className="text-sm font-medium text-neutral-700">홀 수</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  className={`rounded-xl px-4 py-3 font-semibold ${
                    holeCount === 9
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                  onClick={() => updateHoleCount(9)}
                >
                  9홀
                </button>
                <button
                  className={`rounded-xl px-4 py-3 font-semibold ${
                    holeCount === 18
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                  onClick={() => updateHoleCount(18)}
                >
                  18홀
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">홀별 Par 설정</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    수동 입력, 텍스트 붙여넣기, 음성 입력을 지원합니다.
                  </p>
                </div>
                <button
                  className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-neutral-700"
                  onClick={handleCourseWebLookup}
                >
                  웹 자동 조회
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {holePars.map((par, index) => (
                  <div key={index} className="rounded-xl bg-white p-2">
                    <p className="text-xs font-semibold text-neutral-500">{index + 1}번 홀</p>
                    <select
                      className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-2 font-bold outline-none"
                      value={par}
                      onChange={(event) =>
                        updateHolePar(index, Number(event.target.value) as 3 | 4 | 5)
                      }
                    >
                      <option value={3}>Par 3</option>
                      <option value={4}>Par 4</option>
                      <option value={5}>Par 5</option>
                    </select>

                    <input
                      type="number"
                      min={1}
                      max={holeCount}
                      value={holeHandicapRanks[index] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;

                        updateHoleHandicapRank(
                          index,
                          value === "" ? null : Number(value)
                        );
                      }}
                      className="mt-2 w-full rounded-lg border border-neutral-200 px-2 py-2 text-xs outline-none"
                      placeholder="HCP"
                    />
                  </div>
                ))}
              </div>

              <label className="mt-4 block text-sm font-medium text-neutral-700">
                텍스트/음성 입력값
              </label>
              <textarea
                className="mt-2 min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm outline-none focus:border-neutral-900"
                value={parInputText}
                onChange={(event) => setParInputText(event.target.value)}
                placeholder="예: 4 4 3 5 4 4 5 3 4 또는 사 사 삼 오 사 사 오 삼 사"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="rounded-xl bg-neutral-900 px-3 py-3 text-sm font-bold text-white"
                  onClick={applyParInputText}
                >
                  텍스트 적용
                </button>
                <button
                  className={`rounded-xl px-3 py-3 text-sm font-bold ${
                    isListeningPars
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                  }`}
                  onClick={startParVoiceInput}
                >
                  {isListeningPars ? "듣는 중..." : "음성 입력"}
                </button>
              </div>

              <label className="mt-3 block rounded-xl bg-white px-3 py-3 text-center text-sm font-semibold text-neutral-700">
                사진/스크린샷 파일 선택
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleParImageUpload(event.target.files?.[0] ?? null)}
                />
              </label>

              <p className="mt-3 text-xs text-neutral-500">{parHelperMessage}</p>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">플레이어</h2>
            <p className="mt-1 text-sm text-neutral-500">최소 2명, 최대 4명</p>

            <div className="mt-4 space-y-3">
              {playerNames.map((name, index) => {
                const handicap = normalizePlayerHandicap(playerHandicaps[index]);

                return (
                  <div key={index} className="rounded-2xl border border-neutral-200 p-3">
                    <input
                      className="w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900"
                      value={name}
                      onFocus={() => clearDefaultPlayerNameOnFocus(index)}
                      onChange={(event) => updatePlayerName(index, event.target.value)}
                      placeholder={`플레이어 ${index + 1}`}
                    />

                    <div className="mt-3 rounded-2xl bg-neutral-50 p-3">
                      <label className="flex items-center gap-2 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={handicap.enabled}
                          onChange={(event) =>
                            updatePlayerHandicap(index, (prev) => ({
                              ...prev,
                              enabled: event.target.checked,
                            }))
                          }
                        />
                        핸디 적용
                      </label>

                      {handicap.enabled && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-neutral-500">
                              Par 기준 핸디
                            </p>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {([3, 4, 5] as HandicapParValue[]).map((parValue) => (
                                <button
                                  key={parValue}
                                  type="button"
                                  className={`rounded-xl px-3 py-2 text-sm font-bold ${
                                    handicap.parValues.includes(parValue)
                                      ? "bg-blue-700 text-white"
                                      : "bg-white text-neutral-700"
                                  }`}
                                  onClick={() =>
                                    togglePlayerHandicapParValue(index, parValue)
                                  }
                                >
                                  Par {parValue}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-neutral-500">
                              핸디캡 상위 n개 홀
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={holeCount}
                              value={handicap.topHandicapHoleCount || ""}
                              onChange={(event) => {
                                const value = event.target.value;

                                updatePlayerHandicap(index, (prev) => ({
                                  ...prev,
                                  topHandicapHoleCount:
                                    value === "" ? 0 : Math.max(0, Number(value)),
                                }));
                              }}
                              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                              placeholder="예: 3"
                            />
                            <p className="mt-1 text-xs text-neutral-400">
                              예: 3 입력 시 핸디캡 순번 1~3번 홀에서 1타 차감
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">내기 방식 선택</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["stroke", "skins", "vegas", "hussein", "school", "cycle"] as BettingMode[]).map(renderModeButton)}
            </div>
          </section>

          {settings.mode === "stroke" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">스트로크 옵션</h2>
              <label className="mt-4 block text-sm font-medium text-neutral-700">
                1타당 금액
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
              <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-semibold">팀 결정 방식</p>
                <div className="mt-2 grid gap-2">
                  {[
                    {
                      key: "previousRanks",
                      label: "전홀 1,4등 vs 2,3등",
                      teamMode: "previousRanks" as const,
                      teamAssignmentMode: "auto" as const,
                    },
                    {
                      key: "randomAfterHole",
                      label: "홀 종료 후 랜덤 드로우",
                      teamMode: "randomAfterHole" as const,
                      teamAssignmentMode: "auto" as const,
                    },
                    {
                      key: "manualAfterHole",
                      label: "홀 종료 후 직접 입력",
                      teamMode: "randomAfterHole" as const,
                      teamAssignmentMode: "manual" as const,
                    },
                  ].map((option) => {
                    const isSelected =
                      settings.vegas.teamMode === option.teamMode &&
                      (settings.vegas.teamAssignmentMode ?? "auto") ===
                        option.teamAssignmentMode;

                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-xl px-3 py-3 text-sm font-bold ${
                          isSelected
                            ? "bg-orange-600 text-white"
                            : "bg-white text-orange-900"
                        }`}
                        onClick={() =>
                          updateSettings("vegas", {
                            teamMode: option.teamMode,
                            teamAssignmentMode: option.teamAssignmentMode,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3">사전 총액: {formatPlainAmount(settings.vegas.amountPerHole * holeCount)}</p>
                <p>1인 선납 예상: {formatPlainAmount((settings.vegas.amountPerHole * holeCount) / 4)}</p>
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
              <div className="mt-4 rounded-xl bg-purple-50 p-3 text-sm text-purple-900">
                <p className="font-semibold">후세인 선정 방식</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.hussein.selector === "previousFirst"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("hussein", { selector: "previousFirst" })}
                  >
                    전홀 1등
                  </button>
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.hussein.selector === "previousSecond"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("hussein", { selector: "previousSecond" })}
                  >
                    전홀 2등
                  </button>
                </div>
                <p className="mt-4 font-semibold">승부 방식</p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.hussein.compareMode === "bestScore"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("hussein", { compareMode: "bestScore" })}
                  >
                    후세인 vs 3명 중 베스트
                  </button>
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.hussein.compareMode === "tripleSum"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("hussein", { compareMode: "tripleSum" })}
                  >
                    후세인×3 vs 3명 합산
                  </button>
                </div>
                <p className="mt-3">사전 총액: {formatPlainAmount(settings.hussein.amountPerHole * holeCount)}</p>
                <p>1인 선납 예상: {formatPlainAmount((settings.hussein.amountPerHole * holeCount) / 4)}</p>
              </div>
            </section>
          )}

          {settings.mode === "school" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">학교 옵션</h2>
              <p className="mt-1 text-sm text-neutral-500">
                1등 상금과 2등 상금을 따로 지급하는 스킨스 변형 게임입니다.
              </p>

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

              <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
                <p className="font-semibold">사전 모금</p>
                <p>
                  사전 총액: {formatPlainAmount(
                    (settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount
                  )}
                </p>
                <p>
                  1인 선납 예상: {formatPlainAmount(
                    ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) /
                      selectedPlayerCount
                  )}
                </p>
                <p className="mt-2 text-xs">
                  이월 상태는 예: 3학년 2반처럼 표시됩니다.
                </p>
              </div>
            </section>
          )}

          {settings.mode === "cycle" && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">순환게임 옵션</h2>
              <p className="mt-1 text-sm text-neutral-500">
                스킨스 → 후세인 → 라스베가스 순서로 반복합니다.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold">스킨스</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm"
                    value={settings.cycle.skinsAmount}
                    onChange={(event) => updateSettings("cycle", { skinsAmount: Number(event.target.value || 0) })}
                    step={1000}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">후세인</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm"
                    value={settings.cycle.husseinAmount}
                    onChange={(event) => updateSettings("cycle", { husseinAmount: Number(event.target.value || 0) })}
                    step={1000}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">라스베가스</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-2 py-2 text-sm"
                    value={settings.cycle.vegasAmount}
                    onChange={(event) => updateSettings("cycle", { vegasAmount: Number(event.target.value || 0) })}
                    step={1000}
                  />
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-purple-50 p-3 text-sm text-purple-900">
                <p className="font-semibold">무승부 처리</p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.tieMode === "carryOnlyNextGame"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { tieMode: "carryOnlyNextGame" })}
                  >
                    상금만 이월하고 다음 게임 진행
                  </button>
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.tieMode === "carryAndRepeatSameGame"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { tieMode: "carryAndRepeatSameGame" })}
                  >
                    상금 이월 + 같은 게임 유지
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-purple-50 p-3 text-sm text-purple-900">
                <p className="font-semibold">후세인 옵션</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.husseinSelector === "previousFirst"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { husseinSelector: "previousFirst" })}
                  >
                    전홀 1등
                  </button>
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.husseinSelector === "previousSecond"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { husseinSelector: "previousSecond" })}
                  >
                    전홀 2등
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.husseinCompareMode === "bestScore"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { husseinCompareMode: "bestScore" })}
                  >
                    후세인 vs 3명 중 베스트
                  </button>
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.husseinCompareMode === "tripleSum"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { husseinCompareMode: "tripleSum" })}
                  >
                    후세인×3 vs 3명 합산
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-purple-50 p-3 text-sm text-purple-900">
                <p className="font-semibold">라스베가스 팀 방식</p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.vegasTeamMode === "randomAfterHole"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { vegasTeamMode: "randomAfterHole" })}
                  >
                    홀 종료 후 랜덤 드로우
                  </button>
                  <button
                    className={`rounded-xl px-3 py-2 font-semibold ${
                      settings.cycle.vegasTeamMode === "previousRanks"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-900"
                    }`}
                    onClick={() => updateSettings("cycle", { vegasTeamMode: "previousRanks" })}
                  >
                    전홀 1·4등 vs 2·3등
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-purple-50 p-3 text-sm text-purple-900">
                <p className="font-semibold">기본 사전 모금</p>
                <p>기본 3홀 세트: {formatPlainAmount(settings.cycle.skinsAmount + settings.cycle.husseinAmount + settings.cycle.vegasAmount)}</p>
                <p>참고: 실제 이월 여부에 따라 지급 타이밍이 달라집니다.</p>
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">니어 옵션</h2>
            <p className="mt-1 text-sm text-neutral-500">
                파3 홀에서 모든 게임에 적용됩니다.
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
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
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
  });

  const isLastHole = currentHoleIndex >= holes.length - 1;
  const showPrizePool =
    Boolean(activeCalculation.poolSummary) || nearSettlementSummary.totalPool > 0;
  const showRoundHeader =
    roundView !== "play" && roundView !== "latest-result";

  const roundViewTitle: Record<RoundView, string> = {
    play: `${getModeLabel(settings.mode)} 진행 중`,
    "latest-result": "방금 홀 결과",
    settlement: "현재 상금",
    scorecard: "전체 스코어카드",
    pool: "상금 풀",
    "final-share": "최종 정산",
  };

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
    const totalAmountWithNear = summary.totalPrizeAmount + nearTotalAmount;

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
        {showPrizePool && (
          <button
            type="button"
            className="w-full rounded-xl bg-neutral-100 px-4 py-3 text-left text-sm font-semibold"
            onClick={() => setRoundView("pool")}
          >
            상금 풀 보기
          </button>
        )}
        <button
          type="button"
          className="w-full rounded-xl bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700"
          onClick={resetRound}
        >
          새 라운드로 초기화
        </button>
      </div>
    </section>
  );

  const nearSettlementSection =
    nearSettlementSummary.players.some((summary) => summary.totalAmount !== 0) ? (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">니어 정산</h2>
        <p className="mt-1 text-sm text-neutral-500">
          파3 니어 결과가 반영된 별도 정산입니다.
        </p>

        <div className="mt-3 space-y-2">
          {nearSettlementSummary.players
            .filter((summary) => summary.totalAmount !== 0)
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

  const strokeSettlementSection =
    settings.mode === "stroke" && settlementSummary.pairwiseSettlements.length > 0 ? (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">스트로크 지급 내역</h2>
        <div className="mt-3 space-y-2 text-sm">
          {settlementSummary.pairwiseSettlements.map((item, index) => (
            <div key={index} className="rounded-xl bg-neutral-50 p-3">
              <p>
                {getPlayerName(players, item.fromPlayerId)} →{" "}
                {getPlayerName(players, item.toPlayerId)}
              </p>
              <p className="font-semibold">{formatPlainAmount(item.amount)}</p>
              <p className="text-xs text-neutral-500">{item.reason}</p>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const prizePoolSection = showPrizePool ? (
    <section className="rounded-2xl bg-neutral-900 p-5 text-white shadow-sm">
      <h2 className="text-lg font-bold">상금 풀</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white/15 p-3">
          <p className="opacity-80">사전 총액</p>
          <p className="text-lg font-bold">
            {formatPlainAmount(
              (activeCalculation.poolSummary?.totalPool ?? 0) +
                nearSettlementSummary.totalPool
            )}
          </p>
        </div>
        <div className="rounded-xl bg-white/15 p-3">
          <p className="opacity-80">1인 선납</p>
          <p className="text-lg font-bold">
            {formatPlainAmount(
              (activeCalculation.poolSummary?.contributionPerPlayer ?? 0) +
                nearSettlementSummary.contributionPerPlayer
            )}
          </p>
        </div>
        <div className="rounded-xl bg-white/15 p-3">
          <p className="opacity-80">지급 완료</p>
          <p className="text-lg font-bold">
            {formatPlainAmount(
              (activeCalculation.poolSummary?.poolPaid ?? 0) +
                nearSettlementSummary.paidAmount
            )}
          </p>
        </div>
        <div className="rounded-xl bg-white/15 p-3">
          <p className="opacity-80">현재 이월</p>
          <p className="text-lg font-bold">
            {formatPlainAmount(
              (activeCalculation.poolSummary?.remainingCarryOver ?? 0) +
                nearSettlementSummary.remainingPool
            )}
          </p>
        </div>
      </div>
      {settings.mode === "school" && activeCalculation.poolSummary?.schoolLabel && (
        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">
          <p className="font-semibold">
            학교 상태: {activeCalculation.poolSummary.schoolLabel}
          </p>
          <p>
            1등 상금 이월:{" "}
            {formatPlainAmount(activeCalculation.poolSummary.firstPrizeCarryOver ?? 0)}
          </p>
          <p>
            2등 상금 이월:{" "}
            {formatPlainAmount(activeCalculation.poolSummary.secondPrizeCarryOver ?? 0)}
          </p>
        </div>
      )}
      {nearSettlementSummary.totalPool > 0 && (
        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">
          <p className="font-semibold">니어 사전 모금</p>
          <p>니어 총액: {formatPlainAmount(nearSettlementSummary.totalPool)}</p>
          <p>
            1인 추가 선납:{" "}
            {formatPlainAmount(nearSettlementSummary.contributionPerPlayer)}
          </p>
          <p>니어 지급 완료: {formatPlainAmount(nearSettlementSummary.paidAmount)}</p>
          <p>니어 남은 팟: {formatPlainAmount(nearSettlementSummary.remainingPool)}</p>
        </div>
      )}
    </section>
  ) : null;

  return (
    <main className="min-h-screen bg-neutral-100 p-4 text-neutral-900">
      <div className="mx-auto max-w-md space-y-4">
        {showRoundHeader && (
          <header className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-500">{courseName || "라운드팟"}</p>
                <h1 className="text-2xl font-bold">{roundViewTitle[roundView]}</h1>
                <p className="mt-3 text-xs text-neutral-400">
                  자동 저장: {formatSavedTime(lastSavedAt)}
                </p>
              </div>
              <button
                className="rounded-xl bg-neutral-100 px-3 py-2 text-sm font-semibold"
                onClick={resetRound}
              >
                새 라운드
              </button>
            </div>
          </header>
        )}

        {roundView === "play" && (
          <>
{vegasDrawAnimation && (
  <section className="rounded-2xl bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-neutral-500">
          {vegasDrawAnimation.holeNumber}번 홀 라스베가스
        </p>
        <h2 className="text-lg font-bold">{vegasDrawAnimation.message}</h2>
      </div>
      <div className={`text-4xl ${vegasDrawAnimation.isRunning ? "animate-bounce" : ""}`}>
        {vegasDrawAnimation.isRunning ? "🎰" : "🏆"}
      </div>
    </div>

    {vegasDrawAnimation.isRunning ? (
      <div className="mt-4 rounded-2xl bg-blue-50 p-5 text-center">
        <p className="animate-pulse text-lg font-bold text-blue-700">
          카드를 섞고 있습니다...
        </p>
      </div>
    ) : (
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-700">A팀</p>
          <p className="mt-2 font-bold text-blue-950">
            {formatTeam(players, vegasDrawAnimation.teamAPlayerIds)}
          </p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-700">B팀</p>
          <p className="mt-2 font-bold text-amber-950">
            {formatTeam(players, vegasDrawAnimation.teamBPlayerIds)}
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
              const strokes = currentHole.par + scoreToPar;

              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 p-3"
                >
                  <div>
                    <span className="font-medium">{player.name}</span>
                    <p className="text-xs text-neutral-500">실제 {strokes}타</p>
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
