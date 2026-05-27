// src/lib/betting/hussein.ts
// 라운드팟 후세인 계산 엔진
// 규칙: 1명팀(후세인) vs 3명팀. 후세인 선정 방식과 승부 방식을 옵션으로 선택.

import {
  createZeroTotals,
  formatGameType,
  getCompletedHoles,
  getPlayerStrokes,
  type CurrentGamePreview,
  type GameResult,
  type Hole,
  type HoleGameResult,
  type HusseinCompareMode,
  type HusseinSelector,
  type HusseinSettings,
  type Player,
  type Score,
  type Team,
} from "./types";

type HusseinCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: HusseinSettings;
  husseinAssignments?: HusseinAssignment[];
};

export type HusseinAssignment = {
  holeId: string;
  holeNumber: number;
  husseinPlayerId: string;
  reason: string;
};

type PlayerHoleStanding = {
  player: Player;
  strokes: number;
};

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const copied = [...items];
  let state = hashString(seed) || 1;

  function nextRandom() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  }

  for (let index = copied.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(nextRandom() * (index + 1));
    const temp = copied[index];
    copied[index] = copied[randomIndex];
    copied[randomIndex] = temp;
  }

  return copied;
}

function getHoleStandings(
  players: Player[],
  hole: Hole,
  scores: Score[]
): PlayerHoleStanding[] | null {
  const standings: PlayerHoleStanding[] = [];

  for (const player of players) {
    const strokes = getPlayerStrokes(scores, hole.id, player.id);

    if (strokes === null) {
      return null;
    }

    standings.push({
      player,
      strokes,
    });
  }

  return standings.sort((a, b) => {
    if (a.strokes !== b.strokes) return a.strokes - b.strokes;
    return (a.player.order ?? 0) - (b.player.order ?? 0);
  });
}

function groupStandingsByScore(standings: PlayerHoleStanding[]): PlayerHoleStanding[][] {
  const groups: PlayerHoleStanding[][] = [];

  for (const standing of standings) {
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup[0].strokes !== standing.strokes) {
      groups.push([standing]);
    } else {
      lastGroup.push(standing);
    }
  }

  return groups;
}

function getPreviousHole(holes: Hole[], hole: Hole): Hole | null {
  return holes.find((candidate) => candidate.holeNumber === hole.holeNumber - 1) ?? null;
}

function getSelectorLabel(selector: HusseinSelector): string {
  return selector === "previousFirst" ? "전홀 1등" : "전홀 2등";
}

function getCompareModeLabel(compareMode: HusseinCompareMode): string {
  return compareMode === "bestScore"
    ? "후세인 vs 3명 중 베스트"
    : "후세인×3 vs 3명 합산";
}

function selectFromRankGroup(params: {
  standings: PlayerHoleStanding[];
  selector: HusseinSelector;
  seed: string;
}): { player: Player; reason: string } | null {
  const { standings, selector, seed } = params;
  const groups = groupStandingsByScore(standings);

  if (selector === "previousFirst") {
    const firstGroup = groups[0] ?? [];

    if (firstGroup.length === 0) return null;

    const selected = seededShuffle(firstGroup, `${seed}:previous-first`)[0];

    return {
      player: selected.player,
      reason:
        firstGroup.length === 1
          ? `전홀 1등 ${selected.player.name}`
          : `전홀 공동 1등 ${firstGroup.length}명 중 ${selected.player.name} 랜덤 선정`,
    };
  }

  // 전홀 2등 방식.
  // 공동 순위가 있으면 실제 순위표 기준으로 2등 위치에 걸친 그룹에서 랜덤 선정한다.
  // 예: 1,1,3,4이면 2등 위치에 걸친 그룹은 공동 1등 그룹이므로 그 중 랜덤.
  let countBeforeGroup = 0;

  for (const group of groups) {
    const countAfterGroup = countBeforeGroup + group.length;

    if (countBeforeGroup < 2 && countAfterGroup >= 2) {
      const selected = seededShuffle(group, `${seed}:previous-second`)[0];

      return {
        player: selected.player,
        reason:
          group.length === 1
            ? `전홀 2등 ${selected.player.name}`
            : `전홀 2등 후보 ${group.length}명 중 ${selected.player.name} 랜덤 선정`,
      };
    }

    countBeforeGroup = countAfterGroup;
  }

  return null;
}

function createRandomHusseinAssignment(
  hole: Hole,
  players: Player[],
  seedPrefix = "hussein-random"
): HusseinAssignment {
  const shuffled = seededShuffle(
    players,
    `${seedPrefix}:${hole.id}:${hole.holeNumber}:${players.map((player) => player.id).join("|")}`
  );

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    husseinPlayerId: shuffled[0].id,
    reason: `랜덤 선정: ${shuffled[0].name}`,
  };
}

function getStoredAssignment(
  hole: Hole,
  husseinAssignments: HusseinAssignment[] | undefined
): HusseinAssignment | null {
  return husseinAssignments?.find((assignment) => assignment.holeId === hole.id) ?? null;
}

export function createHusseinAssignment(params: {
  hole: Hole;
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: HusseinSettings;
  husseinAssignments?: HusseinAssignment[];
}): HusseinAssignment {
  const { hole, players, holes, scores, settings, husseinAssignments } = params;

  const storedAssignment = getStoredAssignment(hole, husseinAssignments);

  if (storedAssignment) {
    return storedAssignment;
  }

  if (hole.holeNumber === 1) {
    return createRandomHusseinAssignment(hole, players, "hussein-first-hole");
  }

  const previousHole = getPreviousHole(holes, hole);

  if (!previousHole) {
    return createRandomHusseinAssignment(hole, players, "hussein-no-previous-hole");
  }

  const previousStandings = getHoleStandings(players, previousHole, scores);

  if (!previousStandings) {
    return createRandomHusseinAssignment(hole, players, "hussein-previous-not-completed");
  }

  const selected = selectFromRankGroup({
    standings: previousStandings,
    selector: settings.selector,
    seed: `${hole.id}:${previousHole.id}:${settings.selector}`,
  });

  if (!selected) {
    return createRandomHusseinAssignment(hole, players, "hussein-selection-fallback");
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    husseinPlayerId: selected.player.id,
    reason: `${getSelectorLabel(settings.selector)} 방식 · ${selected.reason}`,
  };
}

function createTeam(playerIds: string[], name: string, id: "A" | "B"): Team {
  return {
    id,
    name,
    playerIds,
  };
}

function calculateHusseinScores(params: {
  hole: Hole;
  players: Player[];
  scores: Score[];
  husseinPlayerId: string;
  compareMode: HusseinCompareMode;
}) {
  const { hole, players, scores, husseinPlayerId, compareMode } = params;
  const husseinPlayer = players.find((player) => player.id === husseinPlayerId) ?? null;

  if (!husseinPlayer) {
    return null;
  }

  const restPlayers = players.filter((player) => player.id !== husseinPlayerId);
  const husseinStrokes = getPlayerStrokes(scores, hole.id, husseinPlayerId);

  if (husseinStrokes === null) {
    return null;
  }

  const restStrokes = restPlayers.map((player) => {
    const strokes = getPlayerStrokes(scores, hole.id, player.id);

    return {
      player,
      strokes,
    };
  });

  if (restStrokes.some((item) => item.strokes === null)) {
    return null;
  }

  const numericRestStrokes = restStrokes.map((item) => item.strokes as number);
  const restBestScore = Math.min(...numericRestStrokes);
  const restTotalScore = numericRestStrokes.reduce((sum, value) => sum + value, 0);

  const husseinCompareScore =
    compareMode === "bestScore" ? husseinStrokes : husseinStrokes * 3;
  const restCompareScore =
    compareMode === "bestScore" ? restBestScore : restTotalScore;

  return {
    husseinPlayer,
    restPlayers,
    husseinStrokes,
    restBestScore,
    restTotalScore,
    husseinCompareScore,
    restCompareScore,
    compareMode,
  };
}

function createHoleResult(params: {
  hole: Hole;
  assignment: HusseinAssignment;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
  scoreInfo: NonNullable<ReturnType<typeof calculateHusseinScores>>;
  carryOverEnabled: boolean;
}): HoleGameResult {
  const {
    hole,
    assignment,
    baseAmount,
    carriedIn,
    prizeAmount,
    scoreInfo,
    carryOverEnabled,
  } = params;

  const {
    husseinPlayer,
    restPlayers,
    husseinStrokes,
    restBestScore,
    restTotalScore,
    husseinCompareScore,
    restCompareScore,
    compareMode,
  } = scoreInfo;

  const compareDetail =
    compareMode === "bestScore"
      ? `${husseinPlayer.name} ${husseinStrokes}타 vs 3명팀 베스트 ${restBestScore}타`
      : `${husseinPlayer.name} ${husseinStrokes}타×3=${husseinCompareScore} vs 3명팀 합산 ${restTotalScore}타`;

  if (husseinCompareScore < restCompareScore) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "hussein",
      title: `${hole.holeNumber}번 홀 ${formatGameType("hussein")}`,
      description: `${husseinPlayer.name} 후세인 승리`,
      detail: `${compareDetail} · ${assignment.reason} · ${getCompareModeLabel(compareMode)}`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "player",
      winnerPlayerIds: [husseinPlayer.id],
      isCarryOver: false,
    };
  }

  if (husseinCompareScore > restCompareScore) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "hussein",
      title: `${hole.holeNumber}번 홀 ${formatGameType("hussein")}`,
      description: `3명팀 승리`,
      detail: `${compareDetail} · ${assignment.reason} · ${getCompareModeLabel(compareMode)}`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "team",
      winnerPlayerIds: restPlayers.map((player) => player.id),
      isCarryOver: false,
    };
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameType: "hussein",
    title: `${hole.holeNumber}번 홀 ${formatGameType("hussein")}`,
    description: carryOverEnabled ? "후세인 동점 · 상금 이월" : "후세인 동점 · 미지급",
    detail: carryOverEnabled
      ? `${compareDetail} · ${prizeAmount.toLocaleString()}원이 다음 후세인 홀로 이월됩니다.`
      : `${compareDetail} · ${prizeAmount.toLocaleString()}원은 지급되지 않습니다.`,
    baseAmount,
    carriedIn,
    prizeAmount,
    winnerType: "none",
    winnerPlayerIds: [],
    isCarryOver: carryOverEnabled,
  };
}

export function calculateHusseinBet({
  players,
  holes,
  scores,
  settings,
  husseinAssignments,
}: HusseinCalculationInput): GameResult {
  const prizeTotals = createZeroTotals(players);

  if (!settings.enabled || settings.amountPerHole <= 0 || players.length !== 4) {
    return {
      gameType: "hussein",
      prizeTotals,
      holeResults: [],
      remainingCarryOver: 0,
      poolCollected: 0,
      poolPaid: 0,
    };
  }

  const completedHoles = getCompletedHoles(players, holes, scores);
  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const holeResults: HoleGameResult[] = [];

  let carryOverAmount = 0;
  let poolCollected = 0;
  let poolPaid = 0;

  for (const hole of completedHoles) {
    const assignment = createHusseinAssignment({
      hole,
      players,
      holes: orderedHoles,
      scores,
      settings,
      husseinAssignments,
    });

    const scoreInfo = calculateHusseinScores({
      hole,
      players,
      scores,
      husseinPlayerId: assignment.husseinPlayerId,
      compareMode: settings.compareMode,
    });

    if (!scoreInfo) {
      continue;
    }

    const baseAmount = settings.amountPerHole;
    const carriedIn = carryOverAmount;
    const prizeAmount = baseAmount + carriedIn;

    poolCollected += baseAmount;

    const holeResult = createHoleResult({
      hole,
      assignment,
      baseAmount,
      carriedIn,
      prizeAmount,
      scoreInfo,
      carryOverEnabled: settings.carryOverEnabled,
    });

    holeResults.push(holeResult);

    if (holeResult.winnerPlayerIds.length > 0) {
      const prizePerPlayer = prizeAmount / holeResult.winnerPlayerIds.length;

      for (const playerId of holeResult.winnerPlayerIds) {
        prizeTotals[playerId] += prizePerPlayer;
      }

      poolPaid += prizeAmount;
      carryOverAmount = 0;
      continue;
    }

    if (settings.carryOverEnabled) {
      carryOverAmount = prizeAmount;
    } else {
      carryOverAmount = 0;
    }
  }

  return {
    gameType: "hussein",
    prizeTotals,
    holeResults,
    remainingCarryOver: carryOverAmount,
    poolCollected,
    poolPaid,
  };
}

export function getHusseinCurrentGamePreview(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: HusseinSettings;
  husseinAssignments?: HusseinAssignment[];
}): CurrentGamePreview | null {
  const { players, holes, scores, settings, husseinAssignments } = params;

  if (!settings.enabled || settings.amountPerHole <= 0 || players.length !== 4) {
    return null;
  }

  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const completedHoles = getCompletedHoles(players, orderedHoles, scores);
  const completedHoleIds = new Set(completedHoles.map((hole) => hole.id));
  const nextHole = orderedHoles.find((hole) => !completedHoleIds.has(hole.id));

  if (!nextHole) {
    return null;
  }

  const husseinResult = calculateHusseinBet({
    players,
    holes: orderedHoles,
    scores,
    settings,
    husseinAssignments,
  });

  const assignment = createHusseinAssignment({
    hole: nextHole,
    players,
    holes: orderedHoles,
    scores,
    settings,
    husseinAssignments,
  });

  const carriedIn = husseinResult.remainingCarryOver;
  const baseAmount = settings.amountPerHole;
  const prizeAmount = baseAmount + carriedIn;
  const husseinPlayer = players.find((player) => player.id === assignment.husseinPlayerId);
  const restPlayerIds = players
    .filter((player) => player.id !== assignment.husseinPlayerId)
    .map((player) => player.id);

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    gameType: "hussein",
    title: `${nextHole.holeNumber}번 홀 후세인`,
    description: carriedIn > 0
      ? `이월 ${carriedIn.toLocaleString()}원 포함. 후세인: ${husseinPlayer?.name ?? "미정"}`
      : `후세인: ${husseinPlayer?.name ?? "미정"}`,
    baseAmount,
    carriedIn,
    prizeAmount,
    husseinPlayerId: assignment.husseinPlayerId,
    teams: [
      createTeam([assignment.husseinPlayerId], "후세인", "A"),
      createTeam(restPlayerIds, "3명팀", "B"),
    ],
  };
}

export function getHusseinPoolSummary(params: {
  playerCount: number;
  holeCount: number;
  settings: HusseinSettings;
  result: GameResult;
}) {
  const { playerCount, holeCount, settings, result } = params;
  const totalPool = settings.amountPerHole * holeCount;
  const contributionPerPlayer = playerCount > 0 ? totalPool / playerCount : 0;

  return {
    totalPool,
    contributionPerPlayer,
    poolCollected: result.poolCollected,
    poolPaid: result.poolPaid,
    remainingCarryOver: result.remainingCarryOver,
  };
}

export function getLatestHusseinResult(result: GameResult): HoleGameResult | null {
  return result.holeResults[result.holeResults.length - 1] ?? null;
}
