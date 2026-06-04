// src/lib/betting/skins.ts
// 라운드팟 스킨스 계산 엔진
// 규칙: 각 홀 단독 최저타가 상금 수령. 동점이면 옵션에 따라 이월 또는 미지급.

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
  type SkinsSettings,
} from "./types";

type SkinsCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: SkinsSettings;
};

type HoleStanding = {
  player: Player;
  strokes: number;
};

function getHoleStandings(
  players: Player[],
  hole: Hole,
  scores: Score[]
): HoleStanding[] | null {
  const standings: HoleStanding[] = [];

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

function getSkinsWinner(standings: HoleStanding[]): Player | null {
  if (standings.length === 0) return null;

  const bestScore = standings[0].strokes;
  const winners = standings.filter((standing) => standing.strokes === bestScore);

  if (winners.length !== 1) return null;
  return winners[0].player;
}

function createHoleResult(params: {
  hole: Hole;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
  winner: Player | null;
  tiedPlayerIds: string[];
  bestScore: number | null;
  carryOverEnabled: boolean;
}): HoleGameResult {
  const {
    hole,
    baseAmount,
    carriedIn,
    prizeAmount,
    winner,
    tiedPlayerIds,
    bestScore,
    carryOverEnabled,
  } = params;

  if (winner) {
    return {
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      gameType: "skins",
      title: `${hole.holeNumber}번 홀 ${formatGameType("skins")}`,
      description: `${winner.name} 스킨스 승리`,
      detail: bestScore === null ? undefined : `단독 최저타 ${bestScore}타`,
      baseAmount,
      carriedIn,
      prizeAmount,
      winnerType: "player",
      winnerPlayerIds: [winner.id],
      isCarryOver: false,
    };
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameType: "skins",
    title: `${hole.holeNumber}번 홀 ${formatGameType("skins")}`,
    description: carryOverEnabled ? "스킨스 동점 · 상금 이월" : "스킨스 동점 · 미지급",
    detail: carryOverEnabled
      ? `${prizeAmount.toLocaleString()}원이 다음 스킨스 홀로 이월됩니다.`
      : `${prizeAmount.toLocaleString()}원은 지급되지 않습니다.`,
    baseAmount,
    carriedIn,
    prizeAmount,
    winnerType: "none",
    winnerPlayerIds: [],
    isCarryOver: carryOverEnabled,
    tiedPlayerIds,
  };
}

export function calculateSkinsBet({
  players,
  holes,
  scores,
  settings,
}: SkinsCalculationInput): GameResult {
  const prizeTotals = createZeroTotals(players);

  if (!settings.enabled || settings.amountPerHole <= 0) {
    return {
      gameType: "skins",
      prizeTotals,
      holeResults: [],
      remainingCarryOver: 0,
      poolCollected: 0,
      poolPaid: 0,
    };
  }

  const completedHoles = getCompletedHoles(players, holes, scores);
  const holeResults: HoleGameResult[] = [];

  let carryOverAmount = 0;
  let poolCollected = 0;
  let poolPaid = 0;

  for (const hole of completedHoles) {
    const standings = getHoleStandings(players, hole, scores);
    if (!standings) continue;

    const baseAmount = settings.amountPerHole;
    const carriedIn = carryOverAmount;
    const prizeAmount = baseAmount + carriedIn;
    const winner = getSkinsWinner(standings);
    const bestScore = standings[0]?.strokes ?? null;
    const tiedPlayerIds =
      bestScore === null
        ? []
        : standings
            .filter((standing) => standing.strokes === bestScore)
            .map((standing) => standing.player.id);

    poolCollected += baseAmount;

    const holeResult = createHoleResult({
      hole,
      baseAmount,
      carriedIn,
      prizeAmount,
      winner,
      tiedPlayerIds,
      bestScore,
      carryOverEnabled: settings.carryOverEnabled,
    });

    holeResults.push(holeResult);

    if (winner) {
      prizeTotals[winner.id] += prizeAmount;
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
    gameType: "skins",
    prizeTotals,
    holeResults,
    remainingCarryOver: carryOverAmount,
    poolCollected,
    poolPaid,
  };
}

export function getSkinsCurrentGamePreview(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: SkinsSettings;
}): CurrentGamePreview | null {
  const { players, holes, scores, settings } = params;

  if (!settings.enabled || settings.amountPerHole <= 0) {
    return null;
  }

  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const completedHoles = getCompletedHoles(players, holes, scores);
  const completedHoleIds = new Set(completedHoles.map((hole) => hole.id));
  const nextHole = orderedHoles.find((hole) => !completedHoleIds.has(hole.id));

  if (!nextHole) {
    return null;
  }

  const skinsResult = calculateSkinsBet({
    players,
    holes,
    scores,
    settings,
  });

  const carriedIn = skinsResult.remainingCarryOver;
  const baseAmount = settings.amountPerHole;
  const prizeAmount = baseAmount + carriedIn;

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    gameType: "skins",
    title: `${nextHole.holeNumber}번 홀 스킨스`,
    description: carriedIn > 0
      ? `이월 ${carriedIn.toLocaleString()}원 포함, 단독 최저타가 ${prizeAmount.toLocaleString()}원을 받습니다.`
      : `단독 최저타가 ${prizeAmount.toLocaleString()}원을 받습니다.`,
    baseAmount,
    carriedIn,
    prizeAmount,
  };
}

export function getSkinsPoolSummary(params: {
  playerCount: number;
  holeCount: number;
  settings: SkinsSettings;
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
