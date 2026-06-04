// src/lib/betting/cycle.ts
// 라운드팟 순환게임 계산 엔진
// 규칙: 스킨스 → 후세인 → 라스베가스 반복
// 무승부 처리 옵션:
// 1. carryOnlyNextGame: 상금만 이월하고 다음 게임으로 진행
// 2. carryAndRepeatSameGame: 상금 이월 + 같은 게임 반복

import {
  createZeroTotals,
  formatGameType,
  getCompletedHoles,
  getPlayerStrokes,
  type CurrentGamePreview,
  type CycleSettings,
  type GameResult,
  type GameType,
  type Hole,
  type HoleGameResult,
  type HusseinSettings,
  type Player,
  type Score,
  type Team,
  type TeamAssignment,
  type VegasSettings,
} from "./types";
import {
  createVegasTeamAssignment,
} from "./vegas";
import {
  createHusseinAssignment,
  type HusseinAssignment,
} from "./hussein";

type CycleGame = "skins" | "hussein" | "vegas";

type CycleCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: CycleSettings;
  vegasTeamAssignments?: TeamAssignment[];
  husseinAssignments?: HusseinAssignment[];
};

type CycleState = {
  currentGame: CycleGame;
  carryOverAmount: number;
  currentHusseinAssignment: HusseinAssignment | null;
  currentVegasAssignment: TeamAssignment | null;
  poolCollected: number;
  poolPaid: number;
};

type CycleSimulation = {
  result: GameResult;
  state: CycleState;
};

type CycleSkinsHoleResult = HoleGameResult & {
  innerGameType: "skins";
  skinsPlayerIds: string[];
  skinsScore: number | null;
  skinsResultType: "win" | "tie";
};

function getCycleBaseAmount(game: CycleGame, settings: CycleSettings): number {
  if (game === "skins") return settings.skinsAmount;
  if (game === "hussein") return settings.husseinAmount;
  return settings.vegasAmount;
}

function getNextCycleGame(game: CycleGame): CycleGame {
  if (game === "skins") return "hussein";
  if (game === "hussein") return "vegas";
  return "skins";
}

function createHusseinSettings(settings: CycleSettings): HusseinSettings {
  return {
    enabled: true,
    amountPerHole: settings.husseinAmount,
    carryOverEnabled: true,
    selector: settings.husseinSelector,
    compareMode: settings.husseinCompareMode,
  };
}

function createVegasSettings(settings: CycleSettings): VegasSettings {
  return {
    enabled: true,
    amountPerHole: settings.vegasAmount,
    carryOverEnabled: true,
    teamMode: settings.vegasTeamMode,
  };
}

function getPlayerName(players: Player[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId;
}

function formatTeam(players: Player[], playerIds: string[]): string {
  return playerIds.map((playerId) => getPlayerName(players, playerId)).join(" · ");
}

function getHoleStandings(
  players: Player[],
  hole: Hole,
  scores: Score[]
): Array<{ player: Player; strokes: number }> | null {
  const standings: Array<{ player: Player; strokes: number }> = [];

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

function getSkinsWinner(
  players: Player[],
  hole: Hole,
  scores: Score[]
): { winnerPlayerId: string | null; bestScore: number | null } {
  const standings = getHoleStandings(players, hole, scores);

  if (!standings || standings.length === 0) {
    return {
      winnerPlayerId: null,
      bestScore: null,
    };
  }

  const bestScore = standings[0].strokes;
  const winners = standings.filter((standing) => standing.strokes === bestScore);

  return {
    winnerPlayerId: winners.length === 1 ? winners[0].player.id : null,
    bestScore,
  };
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

function calculateHusseinScores(params: {
  players: Player[];
  hole: Hole;
  scores: Score[];
  assignment: HusseinAssignment;
  settings: CycleSettings;
}) {
  const { players, hole, scores, assignment, settings } = params;
  const husseinPlayer = players.find(
    (player) => player.id === assignment.husseinPlayerId
  );

  if (!husseinPlayer) return null;

  const husseinStrokes = getPlayerStrokes(scores, hole.id, husseinPlayer.id);
  if (husseinStrokes === null) return null;

  const restPlayers = players.filter((player) => player.id !== husseinPlayer.id);
  const restScores = restPlayers.map((player) => ({
    player,
    strokes: getPlayerStrokes(scores, hole.id, player.id),
  }));

  if (restScores.some((item) => item.strokes === null)) return null;

  const numericRestScores = restScores.map((item) => item.strokes as number);
  const restBestScore = Math.min(...numericRestScores);
  const restTotalScore = numericRestScores.reduce((sum, score) => sum + score, 0);

  const husseinCompareScore =
    settings.husseinCompareMode === "bestScore"
      ? husseinStrokes
      : husseinStrokes * 3;
  const restCompareScore =
    settings.husseinCompareMode === "bestScore"
      ? restBestScore
      : restTotalScore;

  return {
    husseinPlayer,
    restPlayers,
    husseinStrokes,
    restBestScore,
    restTotalScore,
    husseinCompareScore,
    restCompareScore,
  };
}

function createSkinsHoleResult(params: {
  players: Player[];
  hole: Hole;
  scores: Score[];
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
}): CycleSkinsHoleResult {
  const { players, hole, scores, baseAmount, carriedIn, prizeAmount } = params;
  const { winnerPlayerId, bestScore } = getSkinsWinner(players, hole, scores);

  const standings = getHoleStandings(players, hole, scores) ?? [];
  const skinsPlayerIds = standings
    .filter((standing) => standing.strokes === bestScore)
    .map((standing) => standing.player.id);

  if (winnerPlayerId) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "cycle",
      title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("skins")}`,
      description: `${getPlayerName(players, winnerPlayerId)} 스킨스 승리`,
      detail: bestScore === null ? undefined : `단독 최저타 ${bestScore}타`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "player",
      winnerPlayerIds: [winnerPlayerId],
      isCarryOver: false,
      innerGameType: "skins",
      skinsPlayerIds,
      skinsScore: bestScore,
      skinsResultType: "win",
    };
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameType: "cycle",
    title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("skins")}`,
    description: "스킨스 동점",
    detail: `${prizeAmount.toLocaleString()}원 이월`,
    baseAmount,
    carriedIn,
    prizeAmount,
    winnerType: "none",
    winnerPlayerIds: [],
    isCarryOver: true,
    tiedPlayerIds: skinsPlayerIds,
    innerGameType: "skins",
    skinsPlayerIds,
    skinsScore: bestScore,
    skinsResultType: "tie",
  };
}

function createHusseinHoleResult(params: {
  players: Player[];
  hole: Hole;
  scores: Score[];
  assignment: HusseinAssignment;
  settings: CycleSettings;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
}): HoleGameResult | null {
  const {
    players,
    hole,
    scores,
    assignment,
    settings,
    baseAmount,
    carriedIn,
    prizeAmount,
  } = params;

  const scoreInfo = calculateHusseinScores({
    players,
    hole,
    scores,
    assignment,
    settings,
  });

  if (!scoreInfo) return null;

  const {
    husseinPlayer,
    restPlayers,
    husseinStrokes,
    restBestScore,
    restTotalScore,
    husseinCompareScore,
    restCompareScore,
  } = scoreInfo;

  const compareDetail =
    settings.husseinCompareMode === "bestScore"
      ? `${husseinPlayer.name} ${husseinStrokes}타 vs 3명팀 베스트 ${restBestScore}타`
      : `${husseinPlayer.name} ${husseinStrokes}타×3=${husseinCompareScore} vs 3명팀 합산 ${restTotalScore}타`;

  if (husseinCompareScore < restCompareScore) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "cycle",
      title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("hussein")}`,
      description: `${husseinPlayer.name} 후세인 승리`,
      detail: `${compareDetail} · ${assignment.reason}`,
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
      gameType: "cycle",
      title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("hussein")}`,
      description: "3명팀 승리",
      detail: `${compareDetail} · ${assignment.reason}`,
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
    gameType: "cycle",
    title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("hussein")}`,
    description: "후세인 동점",
    detail: `${compareDetail} · ${prizeAmount.toLocaleString()}원 이월`,
    baseAmount,
    carriedIn,
    prizeAmount,
    winnerType: "none",
    winnerPlayerIds: [],
    isCarryOver: true,
    tiedPlayerIds: [
      husseinPlayer.id,
      ...restPlayers.map((player) => player.id),
    ],
  };
}

function createVegasHoleResult(params: {
  players: Player[];
  hole: Hole;
  scores: Score[];
  assignment: TeamAssignment;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
}): HoleGameResult | null {
  const { players, hole, scores, assignment, baseAmount, carriedIn, prizeAmount } = params;
  const [teamA, teamB] = assignment.teams;
  const teamAScore = calculateTeamScore(teamA, hole, scores);
  const teamBScore = calculateTeamScore(teamB, hole, scores);

  if (teamAScore === null || teamBScore === null) return null;

  const scoreDetail = `${teamA.name} ${teamAScore}타 vs ${teamB.name} ${teamBScore}타`;

  if (teamAScore < teamBScore) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "cycle",
      title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("vegas")}`,
      description: `${teamA.name} 승리`,
      detail: `${scoreDetail} · ${assignment.reason}`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "team",
      winnerPlayerIds: teamA.playerIds,
      isCarryOver: false,
    };
  }

  if (teamBScore < teamAScore) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "cycle",
      title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("vegas")}`,
      description: `${teamB.name} 승리`,
      detail: `${scoreDetail} · ${assignment.reason}`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "team",
      winnerPlayerIds: teamB.playerIds,
      isCarryOver: false,
    };
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameType: "cycle",
    title: `${hole.holeNumber}번 홀 순환게임 · ${formatGameType("vegas")}`,
    description: "라스베가스 동점",
    detail: `${scoreDetail} · ${prizeAmount.toLocaleString()}원 이월`,
    baseAmount,
    carriedIn,
    prizeAmount,
    winnerType: "none",
    winnerPlayerIds: [],
    isCarryOver: true,
    tiedPlayerIds: [...teamA.playerIds, ...teamB.playerIds],
  };
}

function simulateCycle(params: CycleCalculationInput): CycleSimulation {
  const {
    players,
    holes,
    scores,
    settings,
    vegasTeamAssignments,
    husseinAssignments,
  } = params;

  const prizeTotals = createZeroTotals(players);
  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const completedHoles = getCompletedHoles(players, orderedHoles, scores);
  const holeResults: HoleGameResult[] = [];

  const state: CycleState = {
    currentGame: "skins",
    carryOverAmount: 0,
    currentHusseinAssignment: null,
    currentVegasAssignment: null,
    poolCollected: 0,
    poolPaid: 0,
  };

  if (!settings.enabled || players.length !== 4) {
    return {
      result: {
        gameType: "cycle",
        prizeTotals,
        holeResults,
        remainingCarryOver: 0,
        poolCollected: 0,
        poolPaid: 0,
      },
      state,
    };
  }

  for (const hole of completedHoles) {
    const currentGame = state.currentGame;
    const baseAmount = getCycleBaseAmount(currentGame, settings);
    const carriedIn = state.carryOverAmount;
    const prizeAmount = baseAmount + carriedIn;

    state.poolCollected += baseAmount;

    let holeResult: HoleGameResult | null = null;

    if (currentGame === "skins") {
      holeResult = createSkinsHoleResult({
        players,
        hole,
        scores,
        baseAmount,
        carriedIn,
        prizeAmount,
      });
    }

    if (currentGame === "hussein") {
      const assignment = state.currentHusseinAssignment ?? createHusseinAssignment({
        hole,
        players,
        holes: orderedHoles,
        scores,
        settings: createHusseinSettings(settings),
        husseinAssignments,
      });

      state.currentHusseinAssignment = assignment;

      holeResult = createHusseinHoleResult({
        players,
        hole,
        scores,
        assignment,
        settings,
        baseAmount,
        carriedIn,
        prizeAmount,
      });
    }

    if (currentGame === "vegas") {
      const assignment = state.currentVegasAssignment ?? createVegasTeamAssignment({
        hole,
        players,
        holes: orderedHoles,
        scores,
        settings: createVegasSettings(settings),
        teamAssignments: vegasTeamAssignments,
      });

      state.currentVegasAssignment = assignment;

      holeResult = createVegasHoleResult({
        players,
        hole,
        scores,
        assignment,
        baseAmount,
        carriedIn,
        prizeAmount,
      });
    }

    if (!holeResult) continue;

    holeResults.push(holeResult);

    if (holeResult.winnerPlayerIds.length > 0) {
      const prizePerPlayer = prizeAmount / holeResult.winnerPlayerIds.length;

      for (const playerId of holeResult.winnerPlayerIds) {
        prizeTotals[playerId] += prizePerPlayer;
      }

      state.poolPaid += prizeAmount;
      state.carryOverAmount = 0;
      state.currentGame = getNextCycleGame(currentGame);

      if (currentGame === "hussein") {
        state.currentHusseinAssignment = null;
      }

      if (currentGame === "vegas") {
        state.currentVegasAssignment = null;
      }
    } else if (settings.tieMode === "carryOnlyNextGame") {
      state.carryOverAmount = prizeAmount;
      state.currentGame = getNextCycleGame(currentGame);
      state.currentHusseinAssignment = null;
      state.currentVegasAssignment = null;
    } else {
      state.carryOverAmount = prizeAmount;
      state.currentGame = currentGame;
      // carryAndRepeatSameGame:
      // 후세인과 라스베가스는 같은 후세인/같은 팀 구성을 유지한다.
      // 스킨스는 별도 팀 구성이 없으므로 그대로 반복된다.
    }
  }

  return {
    result: {
      gameType: "cycle",
      prizeTotals,
      holeResults,
      remainingCarryOver: state.carryOverAmount,
      poolCollected: state.poolCollected,
      poolPaid: state.poolPaid,
    },
    state,
  };
}

export function calculateCycleBet(input: CycleCalculationInput): GameResult {
  return simulateCycle(input).result;
}

export function getCycleCurrentGamePreview(input: CycleCalculationInput): CurrentGamePreview | null {
  const { players, holes, scores, settings, vegasTeamAssignments, husseinAssignments } = input;

  if (!settings.enabled || players.length !== 4) {
    return null;
  }

  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const completedHoles = getCompletedHoles(players, orderedHoles, scores);
  const completedHoleIds = new Set(completedHoles.map((hole) => hole.id));
  const nextHole = orderedHoles.find((hole) => !completedHoleIds.has(hole.id));

  if (!nextHole) {
    return null;
  }

  const { state } = simulateCycle(input);
  const currentGame = state.currentGame;
  const baseAmount = getCycleBaseAmount(currentGame, settings);
  const carriedIn = state.carryOverAmount;
  const prizeAmount = baseAmount + carriedIn;

  if (currentGame === "skins") {
    return {
      holeId: nextHole.id,
      holeNumber: nextHole.holeNumber,
      gameType: "cycle",
      title: `${nextHole.holeNumber}번 홀 순환게임 · 스킨스`,
      description: carriedIn > 0
        ? `이월 ${carriedIn.toLocaleString()}원 포함. 단독 최저타가 상금을 받습니다.`
        : "단독 최저타가 상금을 받습니다.",
      baseAmount,
      carriedIn,
      prizeAmount,
    };
  }

  if (currentGame === "hussein") {
    const assignment = state.currentHusseinAssignment ?? createHusseinAssignment({
      hole: nextHole,
      players,
      holes: orderedHoles,
      scores,
      settings: createHusseinSettings(settings),
      husseinAssignments,
    });
    const husseinPlayer = players.find((player) => player.id === assignment.husseinPlayerId);
    const restPlayerIds = players
      .filter((player) => player.id !== assignment.husseinPlayerId)
      .map((player) => player.id);

    return {
      holeId: nextHole.id,
      holeNumber: nextHole.holeNumber,
      gameType: "cycle",
      title: `${nextHole.holeNumber}번 홀 순환게임 · 후세인`,
      description: carriedIn > 0
        ? `이월 ${carriedIn.toLocaleString()}원 포함. 후세인: ${husseinPlayer?.name ?? "미정"}`
        : `후세인: ${husseinPlayer?.name ?? "미정"}`,
      baseAmount,
      carriedIn,
      prizeAmount,
      husseinPlayerId: assignment.husseinPlayerId,
      teams: [
        {
          id: "A",
          name: "후세인",
          playerIds: [assignment.husseinPlayerId],
        },
        {
          id: "B",
          name: "3명팀",
          playerIds: restPlayerIds,
        },
      ],
    };
  }

  const assignment = state.currentVegasAssignment ?? createVegasTeamAssignment({
    hole: nextHole,
    players,
    holes: orderedHoles,
    scores,
    settings: createVegasSettings(settings),
    teamAssignments: vegasTeamAssignments,
  });

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    gameType: "cycle",
    title: `${nextHole.holeNumber}번 홀 순환게임 · 라스베가스`,
    description: carriedIn > 0
      ? `이월 ${carriedIn.toLocaleString()}원 포함. ${assignment.reason}`
      : assignment.reason,
    baseAmount,
    carriedIn,
    prizeAmount,
    teams: assignment.teams,
  };
}

export function getCyclePoolSummary(params: {
  playerCount: number;
  holeCount: number;
  settings: CycleSettings;
  result: GameResult;
}) {
  const { playerCount, holeCount, settings, result } = params;
  let totalPool = 0;
  let currentGame: CycleGame = "skins";

  for (let index = 0; index < holeCount; index += 1) {
    totalPool += getCycleBaseAmount(currentGame, settings);
    currentGame = getNextCycleGame(currentGame);
  }

  const contributionPerPlayer = playerCount > 0 ? totalPool / playerCount : 0;

  return {
    totalPool,
    contributionPerPlayer,
    poolCollected: result.poolCollected,
    poolPaid: result.poolPaid,
    remainingCarryOver: result.remainingCarryOver,
  };
}

export function getLatestCycleResult(result: GameResult): HoleGameResult | null {
  return result.holeResults[result.holeResults.length - 1] ?? null;
}

export function getCycleGameLabel(gameType: GameType): string {
  if (gameType === "skins") return "스킨스";
  if (gameType === "hussein") return "후세인";
  if (gameType === "vegas") return "라스베가스";
  return "순환게임";
}
