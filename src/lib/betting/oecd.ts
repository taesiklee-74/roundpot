// src/lib/betting/oecd.ts
// OECD 대상자/단계 계산 및 수동 벌금 정산 유틸

import type {
  GameResult,
  Hole,
  HoleGameResult,
  HoleOecdPenalty,
  ID,
  OecdPlayerStatus,
  OecdSettings,
  OecdStage,
  Player,
} from "./types";

export type OecdSettlementSummary = {
  byPlayerId: Record<ID, number>;
  players: Array<{
    playerId: ID;
    totalAmount: number;
    breakdowns: string[];
  }>;
  commonPotAmount: number;
  winnerPaidAmount: number;
  totalPenaltyAmount: number;
};

export function roundToNearestManwon(amount: number): number {
  return Math.round(amount / 10000) * 10000;
}

export function getDefaultOecdThresholds(entryFeePerPlayer: number) {
  return {
    stage1Amount: roundToNearestManwon(entryFeePerPlayer * 0.6),
    stage2Amount: roundToNearestManwon(entryFeePerPlayer),
    stage3Amount: roundToNearestManwon(entryFeePerPlayer * 1.4),
  };
}

export function getThresholdBasedOecdStage(
  cumulativeBeforeHole: number,
  settings: OecdSettings
): OecdStage {
  if (!settings.enabled) return 0;
  if (cumulativeBeforeHole >= settings.stage3Amount) return 3;
  if (cumulativeBeforeHole >= settings.stage2Amount) return 2;
  if (cumulativeBeforeHole >= settings.stage1Amount) return 1;
  return 0;
}

function shouldResetMaintainedStage(params: {
  cumulativeBeforeHole: number;
  settings: OecdSettings;
}): boolean {
  const { cumulativeBeforeHole, settings } = params;

  if (cumulativeBeforeHole <= 0) {
    return true;
  }

  if (
    settings.exitRule === "belowEntryAmount" &&
    getThresholdBasedOecdStage(cumulativeBeforeHole, settings) === 0
  ) {
    return true;
  }

  return false;
}

function getMaintainedOecdStageBeforeOrAtCurrentHole(params: {
  playerId: ID;
  currentHoleNumber: number;
  holes: Hole[];
  cumulativeBeforeHoleByNumber: Record<number, Record<ID, number>>;
  currentCumulativeBeforeHole: number;
  settings: OecdSettings;
}): OecdStage {
  const {
    playerId,
    currentHoleNumber,
    holes,
    cumulativeBeforeHoleByNumber,
    currentCumulativeBeforeHole,
    settings,
  } = params;

  let highestStage: OecdStage = 0;

  for (const hole of holes) {
    if (hole.holeNumber > currentHoleNumber) {
      continue;
    }

    const cumulative =
      cumulativeBeforeHoleByNumber[hole.holeNumber]?.[playerId] ??
      (hole.holeNumber === currentHoleNumber ? currentCumulativeBeforeHole : 0);

    if (shouldResetMaintainedStage({ cumulativeBeforeHole: cumulative, settings })) {
      highestStage = 0;
      continue;
    }

    const stage = getThresholdBasedOecdStage(cumulative, settings);

    if (stage > highestStage) {
      highestStage = stage;
    }
  }

  return highestStage;
}

export function calculateOecdStatusesForHole(params: {
  players: Player[];
  holes: Hole[];
  currentHole: Hole;
  cumulativeBeforeHoleByPlayer: Record<ID, number>;
  cumulativeBeforeHoleByNumber?: Record<number, Record<ID, number>>;
  settings: OecdSettings;
}): OecdPlayerStatus[] {
  const {
    players,
    holes,
    currentHole,
    cumulativeBeforeHoleByPlayer,
    cumulativeBeforeHoleByNumber = {},
    settings,
  } = params;

  if (!settings.enabled) {
    return players.map((player) => ({
      playerId: player.id,
      cumulativeBeforeHole: cumulativeBeforeHoleByPlayer[player.id] ?? 0,
      stage: 0,
      isTarget: false,
    }));
  }

  return players.map((player) => {
    const cumulativeBeforeHole = cumulativeBeforeHoleByPlayer[player.id] ?? 0;
    const thresholdStage = getThresholdBasedOecdStage(
      cumulativeBeforeHole,
      settings
    );
    const maintainedStage = getMaintainedOecdStageBeforeOrAtCurrentHole({
      playerId: player.id,
      currentHoleNumber: currentHole.holeNumber,
      holes,
      cumulativeBeforeHoleByNumber,
      currentCumulativeBeforeHole: cumulativeBeforeHole,
      settings,
    });

    if (settings.exitRule === "belowEntryAmount") {
      const isTarget = thresholdStage > 0;

      return {
        playerId: player.id,
        cumulativeBeforeHole,
        stage: isTarget ? maintainedStage : 0,
        isTarget,
      };
    }

    const isTarget = maintainedStage > 0 && cumulativeBeforeHole > 0;

    return {
      playerId: player.id,
      cumulativeBeforeHole,
      stage: isTarget ? maintainedStage : 0,
      isTarget,
    };
  });
}

export function getOecdStatusLabel(status: OecdPlayerStatus | null | undefined): string {
  if (!status || !status.isTarget || status.stage === 0) {
    return "OECD 대상 아님";
  }

  return `OECD ${status.stage}단계`;
}

export function upsertOecdPenalty(
  penalties: HoleOecdPenalty[],
  nextPenalty: HoleOecdPenalty
): HoleOecdPenalty[] {
  const existingIndex = penalties.findIndex(
    (penalty) =>
      penalty.holeId === nextPenalty.holeId &&
      penalty.playerId === nextPenalty.playerId
  );

  const normalizedPenalty = {
    ...nextPenalty,
    amount: Math.max(0, Math.round(nextPenalty.amount)),
  };

  if (existingIndex === -1) {
    return normalizedPenalty.amount > 0
      ? [...penalties, normalizedPenalty]
      : penalties;
  }

  if (normalizedPenalty.amount <= 0) {
    return penalties.filter((_, index) => index !== existingIndex);
  }

  return penalties.map((penalty, index) =>
    index === existingIndex ? normalizedPenalty : penalty
  );
}

function getHoleWinnerPlayerIds(
  gameResult: GameResult | null | undefined,
  holeId: ID
): ID[] {
  const holeResult: HoleGameResult | undefined = gameResult?.holeResults.find(
    (result) => result.holeId === holeId
  );

  if (!holeResult || holeResult.winnerType === "none") {
    return [];
  }

  return holeResult.winnerPlayerIds;
}

export function calculateOecdSettlementSummary(params: {
  players: Player[];
  penalties: HoleOecdPenalty[];
  settings: OecdSettings;
  gameResult?: GameResult | null;
}): OecdSettlementSummary {
  const { players, penalties, settings, gameResult = null } = params;
  const byPlayerId = players.reduce<Record<ID, number>>((acc, player) => {
    acc[player.id] = 0;
    return acc;
  }, {});
  const breakdownsByPlayerId = players.reduce<Record<ID, string[]>>((acc, player) => {
    acc[player.id] = [];
    return acc;
  }, {});

  let commonPotAmount = 0;
  let winnerPaidAmount = 0;
  let totalPenaltyAmount = 0;

  if (!settings.enabled) {
    return {
      byPlayerId,
      players: players.map((player) => ({
        playerId: player.id,
        totalAmount: 0,
        breakdowns: [],
      })),
      commonPotAmount,
      winnerPaidAmount,
      totalPenaltyAmount,
    };
  }

  for (const penalty of penalties) {
    const amount = Math.max(0, penalty.amount);
    if (amount <= 0) continue;

    byPlayerId[penalty.playerId] = (byPlayerId[penalty.playerId] ?? 0) - amount;
    breakdownsByPlayerId[penalty.playerId]?.push(
      `${penalty.holeNumber}번 홀 OECD 벌금 -${amount.toLocaleString()}원`
    );
    totalPenaltyAmount += amount;

    const winnerPlayerIds =
      settings.penaltyDestination === "winner"
        ? getHoleWinnerPlayerIds(gameResult, penalty.holeId)
        : [];

    if (settings.penaltyDestination === "winner" && winnerPlayerIds.length > 0) {
      const baseShare = Math.floor(amount / winnerPlayerIds.length);
      let remainder = amount - baseShare * winnerPlayerIds.length;

      for (const winnerPlayerId of winnerPlayerIds) {
        const share = baseShare + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        byPlayerId[winnerPlayerId] = (byPlayerId[winnerPlayerId] ?? 0) + share;
        breakdownsByPlayerId[winnerPlayerId]?.push(
          `${penalty.holeNumber}번 홀 OECD 수령 +${share.toLocaleString()}원`
        );
        winnerPaidAmount += share;
      }
    } else {
      commonPotAmount += amount;
    }
  }

  return {
    byPlayerId,
    players: players.map((player) => ({
      playerId: player.id,
      totalAmount: byPlayerId[player.id] ?? 0,
      breakdowns: breakdownsByPlayerId[player.id] ?? [],
    })),
    commonPotAmount,
    winnerPaidAmount,
    totalPenaltyAmount,
  };
}
