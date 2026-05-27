// src/lib/betting/settlement.ts
// 라운드팟 정산 통합 엔진
// 목적: 스트로크 손익 + 사전모금형 게임 상금 수령액을 화면 표시용으로 합산한다.

import {
  createZeroTotals,
  type BettingCalculationResult,
  type BettingMode,
  type GameResult,
  type ID,
  type PairwiseSettlement,
  type Player,
  type StrokeBetResult,
} from "./types";

export type PlayerSettlementSummary = {
  playerId: ID;
  playerName: string;

  // 스트로크는 실제 손익으로 본다.
  strokeNetAmount: number;

  // 사전 모금형 게임은 현재까지 실제 받은 상금 수령액으로 본다.
  skinsPrizeAmount: number;
  vegasPrizeAmount: number;
  husseinPrizeAmount: number;
  schoolPrizeAmount: number;
  cyclePrizeAmount: number;

  // 사전 모금형 게임의 총 누적 수령액.
  totalPrizeAmount: number;

  // 참고용 전체 정산값.
  // 스트로크 손익 + 상금 누적 수령액.
  totalSettlementReferenceAmount: number;
};

export type SettlementSummary = {
  players: PlayerSettlementSummary[];
  totalPrizeAmount: number;
  totalStrokeNetAmount: number;
  totalSettlementReferenceAmount: number;
  pairwiseSettlements: PairwiseSettlement[];
};

type GameResultMap = Partial<Record<BettingMode, GameResult>>;

type SettlementInput = {
  players: Player[];
  gameResults: GameResultMap;
  strokeBet?: StrokeBetResult | null;
};

function getPrizeAmount(
  gameResults: GameResultMap,
  gameType: BettingMode,
  playerId: ID
): number {
  return gameResults[gameType]?.prizeTotals[playerId] ?? 0;
}

function getStrokeNetAmount(
  strokeBet: StrokeBetResult | null | undefined,
  playerId: ID
): number {
  return strokeBet?.totals[playerId] ?? 0;
}

export function calculateSettlementSummary({
  players,
  gameResults,
  strokeBet,
}: SettlementInput): SettlementSummary {
  const playerSummaries = players.map<PlayerSettlementSummary>((player) => {
    const strokeNetAmount = getStrokeNetAmount(strokeBet, player.id);
    const skinsPrizeAmount = getPrizeAmount(gameResults, "skins", player.id);
    const vegasPrizeAmount = getPrizeAmount(gameResults, "vegas", player.id);
    const husseinPrizeAmount = getPrizeAmount(gameResults, "hussein", player.id);
    const schoolPrizeAmount = getPrizeAmount(gameResults, "school", player.id);
    const cyclePrizeAmount = getPrizeAmount(gameResults, "cycle", player.id);

    const totalPrizeAmount =
      skinsPrizeAmount + vegasPrizeAmount + husseinPrizeAmount + schoolPrizeAmount +cyclePrizeAmount;

    const totalSettlementReferenceAmount = strokeNetAmount + totalPrizeAmount;

    return {
      playerId: player.id,
      playerName: player.name,
      strokeNetAmount,
      skinsPrizeAmount,
      vegasPrizeAmount,
      husseinPrizeAmount,
      schoolPrizeAmount,
      cyclePrizeAmount,
      totalPrizeAmount,
      totalSettlementReferenceAmount,
    };
  });

  return {
    players: playerSummaries,
    totalPrizeAmount: playerSummaries.reduce(
      (sum, player) => sum + player.totalPrizeAmount,
      0
    ),
    totalStrokeNetAmount: playerSummaries.reduce(
      (sum, player) => sum + player.strokeNetAmount,
      0
    ),
    totalSettlementReferenceAmount: playerSummaries.reduce(
      (sum, player) => sum + player.totalSettlementReferenceAmount,
      0
    ),
    pairwiseSettlements: strokeBet?.pairwiseSettlements ?? [],
  };
}

export function mergeGamePrizeTotals(params: {
  players: Player[];
  gameResults: GameResult[];
}): Record<ID, number> {
  const { players, gameResults } = params;
  const totals = createZeroTotals(players);

  for (const result of gameResults) {
    for (const player of players) {
      totals[player.id] += result.prizeTotals[player.id] ?? 0;
    }
  }

  return totals;
}

export function getLatestGameResult(
  gameResults: GameResultMap
) {
  const candidates = Object.values(gameResults)
    .flatMap((result) => result?.holeResults ?? [])
    .sort((a, b) => {
      if (a.holeNumber !== b.holeNumber) return b.holeNumber - a.holeNumber;
      return a.title.localeCompare(b.title);
    });

  return candidates[0] ?? null;
}

export function getPoolSummary(result: GameResult) {
  return {
    poolCollected: result.poolCollected,
    poolPaid: result.poolPaid,
    remainingCarryOver: result.remainingCarryOver,
  };
}

export function formatAmount(amount: number): string {
  if (amount > 0) return `+${amount.toLocaleString()}원`;
  if (amount < 0) return `${amount.toLocaleString()}원`;
  return "0원";
}

export function formatPrizeBreakdown(summary: PlayerSettlementSummary): string {
  const parts: string[] = [];

  if (summary.skinsPrizeAmount !== 0) {
    parts.push(`스킨스 ${formatAmount(summary.skinsPrizeAmount)}`);
  }

  if (summary.vegasPrizeAmount !== 0) {
    parts.push(`라스베가스 ${formatAmount(summary.vegasPrizeAmount)}`);
  }

  if (summary.husseinPrizeAmount !== 0) {
    parts.push(`후세인 ${formatAmount(summary.husseinPrizeAmount)}`);
  }

  if (summary.schoolPrizeAmount !== 0) {
    parts.push(`학교 ${formatAmount(summary.schoolPrizeAmount)}`);
  }

  if (summary.cyclePrizeAmount !== 0) {
    parts.push(`순환게임 ${formatAmount(summary.cyclePrizeAmount)}`);
  }

  if (parts.length === 0) {
    return "상금 수령 없음";
  }

  return parts.join(" · ");
}

export function formatSettlementReference(summary: PlayerSettlementSummary): string {
  return `스트로크 손익 ${formatAmount(
    summary.strokeNetAmount
  )} · 전체 정산 참고 ${formatAmount(summary.totalSettlementReferenceAmount)}`;
}

export function createGameResultMap(
  results: BettingCalculationResult[]
): GameResultMap {
  return results.reduce<GameResultMap>((acc, result) => {
    acc[result.mode] = result.gameResult;
    return acc;
  }, {});
}
