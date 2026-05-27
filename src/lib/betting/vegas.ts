// src/lib/betting/vegas.ts
// 라운드팟 라스베가스 계산 엔진
// 규칙: 2:2 팀전. 팀 합산 스코어가 낮은 팀이 상금 수령. 동점이면 옵션에 따라 이월.

import {
  createZeroTotals,
  formatGameType,
  getCompletedHoles,
  getPlayerStrokes,
  type CurrentGamePreview,
  type GameResult,
  type Hole,
  type HoleGameResult,
  type Player,
  type Score,
  type Team,
  type TeamAssignment,
  type VegasSettings,
} from "./types";

type VegasCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: VegasSettings;
  teamAssignments?: TeamAssignment[];
};

type PlayerHoleStanding = {
  player: Player;
  strokes: number;
};

export type VegasHoleResult = HoleGameResult & {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAScore: number;
  teamBScore: number;
  winnerTeamId: "A" | "B" | null;
  assignmentReason: string;
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

function createTeamsFromPlayerIds(
  hole: Hole,
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
  reason: string
): TeamAssignment {
  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    teams: [
      {
        id: "A",
        name: "A팀",
        playerIds: teamAPlayerIds,
      },
      {
        id: "B",
        name: "B팀",
        playerIds: teamBPlayerIds,
      },
    ],
    reason,
  };
}

function createRandomTeamAssignment(
  hole: Hole,
  players: Player[],
  seedPrefix = "vegas-random"
): TeamAssignment {
  const shuffled = seededShuffle(
    players,
    `${seedPrefix}:${hole.id}:${hole.holeNumber}:${players.map((player) => player.id).join("|")}`
  );

  return createTeamsFromPlayerIds(
    hole,
    shuffled.slice(0, 2).map((player) => player.id),
    shuffled.slice(2, 4).map((player) => player.id),
    "랜덤 드로우"
  );
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

function hasTie(standings: PlayerHoleStanding[]): boolean {
  const seenScores = new Set<number>();

  for (const standing of standings) {
    if (seenScores.has(standing.strokes)) return true;
    seenScores.add(standing.strokes);
  }

  return false;
}

function getPreviousHole(holes: Hole[], hole: Hole): Hole | null {
  return holes.find((candidate) => candidate.holeNumber === hole.holeNumber - 1) ?? null;
}

function createPreviousRanksTeamAssignment(
  hole: Hole,
  players: Player[],
  holes: Hole[],
  scores: Score[]
): TeamAssignment {
  if (hole.holeNumber === 1) {
    return createRandomTeamAssignment(hole, players, "vegas-first-hole");
  }

  const previousHole = getPreviousHole(holes, hole);

  if (!previousHole) {
    return createRandomTeamAssignment(hole, players, "vegas-no-previous-hole");
  }

  const previousStandings = getHoleStandings(players, previousHole, scores);

  if (!previousStandings || hasTie(previousStandings)) {
    return createRandomTeamAssignment(
      hole,
      players,
      `vegas-tie-previous-hole-${previousHole.id}`
    );
  }

  return createTeamsFromPlayerIds(
    hole,
    [previousStandings[0].player.id, previousStandings[3].player.id],
    [previousStandings[1].player.id, previousStandings[2].player.id],
    `전홀 ${previousHole.holeNumber}번 홀 1·4등 vs 2·3등`
  );
}

function getStoredAssignment(
  hole: Hole,
  teamAssignments: TeamAssignment[] | undefined
): TeamAssignment | null {
  return teamAssignments?.find((assignment) => assignment.holeId === hole.id) ?? null;
}

export function createVegasTeamAssignment(params: {
  hole: Hole;
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: VegasSettings;
  teamAssignments?: TeamAssignment[];
}): TeamAssignment {
  const { hole, players, holes, scores, settings, teamAssignments } = params;

  const storedAssignment = getStoredAssignment(hole, teamAssignments);

  if (storedAssignment) {
    return storedAssignment;
  }

  if (settings.teamMode === "previousRanks") {
    return createPreviousRanksTeamAssignment(hole, players, holes, scores);
  }

  return createRandomTeamAssignment(hole, players, "vegas-after-hole-random");
}

function calculateTeamScore(team: Team, hole: Hole, scores: Score[]): number | null {
  let total = 0;

  for (const playerId of team.playerIds) {
    const strokes = getPlayerStrokes(scores, hole.id, playerId);

    if (strokes === null) {
      return null;
    }

    total += strokes;
  }

  return total;
}

function getWinnerTeam(params: {
  teamA: Team;
  teamB: Team;
  teamAScore: number;
  teamBScore: number;
}): Team | null {
  const { teamA, teamB, teamAScore, teamBScore } = params;

  if (teamAScore < teamBScore) return teamA;
  if (teamBScore < teamAScore) return teamB;
  return null;
}

function createHoleResult(params: {
  hole: Hole;
  assignment: TeamAssignment;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
  teamAScore: number;
  teamBScore: number;
  winnerTeam: Team | null;
  carryOverEnabled: boolean;
}): VegasHoleResult {
  const {
    hole,
    assignment,
    baseAmount,
    carriedIn,
    prizeAmount,
    teamAScore,
    teamBScore,
    winnerTeam,
    carryOverEnabled,
  } = params;

  const [teamA, teamB] = assignment.teams;
  const extraResultFields = {
  teamAPlayerIds: teamA.playerIds,
  teamBPlayerIds: teamB.playerIds,
  teamAScore,
  teamBScore,
  winnerTeamId: winnerTeam?.id ?? null,
  assignmentReason: assignment.reason,
};
  const scoreDetail = `${teamA.name} ${teamAScore}타 vs ${teamB.name} ${teamBScore}타`;

  if (winnerTeam) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "vegas",
      title: `${hole.holeNumber}번 홀 ${formatGameType("vegas")}`,
      description: `${winnerTeam.name} 승리`,
      detail: `${scoreDetail} · ${assignment.reason}`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "team",
      winnerPlayerIds: winnerTeam.playerIds,
      isCarryOver: false,
      ...extraResultFields,
    };
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameType: "vegas",
    title: `${hole.holeNumber}번 홀 ${formatGameType("vegas")}`,
    description: carryOverEnabled ? "라스베가스 동점 · 상금 이월" : "라스베가스 동점 · 미지급",
    detail: carryOverEnabled
      ? `${scoreDetail} · ${prizeAmount.toLocaleString()}원이 다음 라스베가스 홀로 이월됩니다.`
      : `${scoreDetail} · ${prizeAmount.toLocaleString()}원은 지급되지 않습니다.`,
    baseAmount,
    carriedIn,
    prizeAmount,
    winnerType: "none",
    winnerPlayerIds: [],
    isCarryOver: carryOverEnabled,
    ...extraResultFields,

  };
}

export function calculateVegasBet({
  players,
  holes,
  scores,
  settings,
  teamAssignments,
}: VegasCalculationInput): GameResult {
  const prizeTotals = createZeroTotals(players);

  if (!settings.enabled || settings.amountPerHole <= 0 || players.length !== 4) {
    return {
      gameType: "vegas",
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
    const assignment = createVegasTeamAssignment({
      hole,
      players,
      holes: orderedHoles,
      scores,
      settings,
      teamAssignments,
    });

    const [teamA, teamB] = assignment.teams;
    const teamAScore = calculateTeamScore(teamA, hole, scores);
    const teamBScore = calculateTeamScore(teamB, hole, scores);

    if (teamAScore === null || teamBScore === null) {
      continue;
    }

    const baseAmount = settings.amountPerHole;
    const carriedIn = carryOverAmount;
    const prizeAmount = baseAmount + carriedIn;

    poolCollected += baseAmount;

    const winnerTeam = getWinnerTeam({
      teamA,
      teamB,
      teamAScore,
      teamBScore,
    });

    const holeResult = createHoleResult({
      hole,
      assignment,
      baseAmount,
      carriedIn,
      prizeAmount,
      teamAScore,
      teamBScore,
      winnerTeam,
      carryOverEnabled: settings.carryOverEnabled,
    });

    holeResults.push(holeResult);

    if (winnerTeam) {
      const prizePerPlayer = prizeAmount / winnerTeam.playerIds.length;

      for (const playerId of winnerTeam.playerIds) {
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
    gameType: "vegas",
    prizeTotals,
    holeResults,
    remainingCarryOver: carryOverAmount,
    poolCollected,
    poolPaid,
  };
}

export function getVegasCurrentGamePreview(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: VegasSettings;
  teamAssignments?: TeamAssignment[];
}): CurrentGamePreview | null {
  const { players, holes, scores, settings, teamAssignments } = params;

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

  const vegasResult = calculateVegasBet({
    players,
    holes: orderedHoles,
    scores,
    settings,
    teamAssignments,
  });

  const carriedIn = vegasResult.remainingCarryOver;
  const baseAmount = settings.amountPerHole;
  const prizeAmount = baseAmount + carriedIn;

  if (settings.teamMode === "randomAfterHole") {
    return {
      holeId: nextHole.id,
      holeNumber: nextHole.holeNumber,
      gameType: "vegas",
      title: `${nextHole.holeNumber}번 홀 라스베가스`,
      description: carriedIn > 0
        ? `이월 ${carriedIn.toLocaleString()}원 포함. 홀 종료 후 랜덤 드로우로 팀을 정합니다.`
        : "홀 종료 후 랜덤 드로우로 팀을 정합니다.",
      baseAmount,
      carriedIn,
      prizeAmount,
    };
  }

  const assignment = createVegasTeamAssignment({
    hole: nextHole,
    players,
    holes: orderedHoles,
    scores,
    settings,
    teamAssignments,
  });

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    gameType: "vegas",
    title: `${nextHole.holeNumber}번 홀 라스베가스`,
    description: carriedIn > 0
      ? `이월 ${carriedIn.toLocaleString()}원 포함. ${assignment.reason}`
      : assignment.reason,
    baseAmount,
    carriedIn,
    prizeAmount,
    teams: assignment.teams,
  };
}

export function getVegasPoolSummary(params: {
  playerCount: number;
  holeCount: number;
  settings: VegasSettings;
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

export function getLatestVegasResult(result: GameResult): HoleGameResult | null {
  return result.holeResults[result.holeResults.length - 1] ?? null;
}
