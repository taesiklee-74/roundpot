// src/lib/betting/stroke.ts
// 라운드팟 스트로크 계산 엔진
// 규칙: 플레이어 간 누적 타수 차이를 1:1로 비교해 정산한다. 이월 없음.

import {
  createZeroTotals,
  getCompletedHoles,
  getPlayerStrokes,
  type GameResult,
  type Hole,
  type HoleGameResult,
  type PairwiseSettlement,
  type Player,
  type Score,
  type StrokeBetResult,
  type StrokeSettings,
} from "./types";

type StrokeCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: StrokeSettings;
};

type PlayerStrokeSummary = {
  playerId: string;
  playerName: string;
  totalStrokes: number;
  holesPlayed: number;
};

function getCompletedStrokeSummaries(
  players: Player[],
  holes: Hole[],
  scores: Score[]
): PlayerStrokeSummary[] {
  const completedHoles = getCompletedHoles(players, holes, scores);

  return players.map((player) => {
    const totalStrokes = completedHoles.reduce((sum, hole) => {
      const strokes = getPlayerStrokes(scores, hole.id, player.id);
      return sum + (strokes ?? 0);
    }, 0);

    return {
      playerId: player.id,
      playerName: player.name,
      totalStrokes,
      holesPlayed: completedHoles.length,
    };
  });
}

function createPairwiseSettlement(params: {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  strokeDiff: number;
  amountPerStroke: number;
}): PairwiseSettlement {
  const { fromPlayerId, toPlayerId, amount, strokeDiff, amountPerStroke } = params;

  return {
    fromPlayerId,
    toPlayerId,
    amount,
    reason: `${strokeDiff}타 차이 × ${amountPerStroke.toLocaleString()}원`,
  };
}

export function calculateStrokeBet({
  players,
  holes,
  scores,
  settings,
}: StrokeCalculationInput): StrokeBetResult {
  const totals = createZeroTotals(players);
  const pairwiseSettlements: PairwiseSettlement[] = [];

  if (!settings.enabled || settings.amountPerStroke <= 0 || players.length < 2) {
    return {
      totals,
      pairwiseSettlements,
    };
  }

  const summaries = getCompletedStrokeSummaries(players, holes, scores);

  for (let i = 0; i < summaries.length; i += 1) {
    for (let j = i + 1; j < summaries.length; j += 1) {
      const playerA = summaries[i];
      const playerB = summaries[j];
      const strokeDiff = Math.abs(playerA.totalStrokes - playerB.totalStrokes);

      if (strokeDiff === 0) continue;

      const amount = strokeDiff * settings.amountPerStroke;
      const winner = playerA.totalStrokes < playerB.totalStrokes ? playerA : playerB;
      const loser = playerA.totalStrokes < playerB.totalStrokes ? playerB : playerA;

      totals[winner.playerId] += amount;
      totals[loser.playerId] -= amount;

      pairwiseSettlements.push(
        createPairwiseSettlement({
          fromPlayerId: loser.playerId,
          toPlayerId: winner.playerId,
          amount,
          strokeDiff,
          amountPerStroke: settings.amountPerStroke,
        })
      );
    }
  }

  return {
    totals,
    pairwiseSettlements,
  };
}

export function calculateStrokeGameResult(input: StrokeCalculationInput): GameResult {
  const strokeBet = calculateStrokeBet(input);

  return {
    gameType: "stroke",
    prizeTotals: createZeroTotals(input.players),
    netTotals: strokeBet.totals,
    holeResults: [],
    remainingCarryOver: 0,
    poolCollected: 0,
    poolPaid: 0,
  };
}

export function getStrokeSummary(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
}) {
  const { players, holes, scores } = params;
  return getCompletedStrokeSummaries(players, holes, scores);
}

export function getStrokeCurrentGamePreview(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: StrokeSettings;
}) {
  const { players, holes, scores, settings } = params;

  if (!settings.enabled || settings.amountPerStroke <= 0) {
    return null;
  }

  const completedHoles = getCompletedHoles(players, holes, scores);
  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const completedHoleIds = new Set(completedHoles.map((hole) => hole.id));
  const nextHole = orderedHoles.find((hole) => !completedHoleIds.has(hole.id));

  if (!nextHole) {
    return null;
  }

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    gameType: "stroke" as const,
    title: `${nextHole.holeNumber}번 홀 스트로크`,
    description: `전체 누적 타수 차이를 1타당 ${settings.amountPerStroke.toLocaleString()}원으로 정산합니다.`,
    baseAmount: 0,
    carriedIn: 0,
    prizeAmount: 0,
  };
}

export function getStrokePairwiseText(params: {
  players: Player[];
  settlement: PairwiseSettlement;
}) {
  const { players, settlement } = params;
  const fromPlayer = players.find((player) => player.id === settlement.fromPlayerId);
  const toPlayer = players.find((player) => player.id === settlement.toPlayerId);

  return `${fromPlayer?.name ?? settlement.fromPlayerId} → ${toPlayer?.name ?? settlement.toPlayerId}: ${settlement.amount.toLocaleString()}원 (${settlement.reason})`;
}

export function getLatestStrokeResult(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: StrokeSettings;
}): HoleGameResult | null {
  const { players, holes, scores, settings } = params;

  if (!settings.enabled || settings.amountPerStroke <= 0) {
    return null;
  }

  const completedHoles = getCompletedHoles(players, holes, scores);
  const latestHole = completedHoles[completedHoles.length - 1];

  if (!latestHole) {
    return null;
  }

  const summaries = getCompletedStrokeSummaries(players, holes, scores)
    .slice()
    .sort((a, b) => {
      if (a.totalStrokes !== b.totalStrokes) return a.totalStrokes - b.totalStrokes;
      return a.playerName.localeCompare(b.playerName);
    });

  const leader = summaries[0];
  const tiedLeaders = summaries.filter(
    (summary) => summary.totalStrokes === leader.totalStrokes
  );

  return {
    holeId: latestHole.id,
    holeNumber: latestHole.holeNumber,
    gameType: "stroke",
    title: `${latestHole.holeNumber}번 홀까지 스트로크 현황`,
    description:
      tiedLeaders.length === 1
        ? `현재 1위: ${leader.playerName}`
        : `현재 공동 1위: ${tiedLeaders.map((item) => item.playerName).join(" · ")}`,
    detail: summaries
      .map((summary) => `${summary.playerName} ${summary.totalStrokes}타`)
      .join(" / "),
    baseAmount: 0,
    carriedIn: 0,
    prizeAmount: 0,
    winnerType: tiedLeaders.length === 1 ? "player" : "none",
    winnerPlayerIds: tiedLeaders.length === 1 ? [leader.playerId] : [],
    isCarryOver: false,
  };
}
