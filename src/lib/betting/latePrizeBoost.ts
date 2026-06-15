// src/lib/betting/latePrizeBoost.ts
// 종반전 잔여 상금 증액 제안/배정/정산 유틸

import type {
  BettingSettingsV2,
  GameResult,
  Hole,
  ID,
  Player,
} from "./types";

export type LatePrizeBoostAllocation = {
  holeId: ID;
  holeNumber: number;
  extraMainPrizeAmount: number;
};

export type LatePrizeBoostDecision = {
  acceptedAtHoleNumber: number | null;
  declinedHoleNumbers: number[];
  allocations: LatePrizeBoostAllocation[];
};

export type LatePrizeBoostOffer = {
  shouldOffer: boolean;
  holeNumber: number;
  currentTotalBalance: number;
  remainingExpectedPayout: number;
  excessAmount: number;
  baseMainPrizeAmount: number;
  remainingHoleNumbers: number[];
  allocations: LatePrizeBoostAllocation[];
  reason: string;
};

export type LatePrizeBoostSettlementSummary = {
  byPlayerId: Record<ID, number>;
  players: Array<{
    playerId: ID;
    totalAmount: number;
    breakdowns: string[];
  }>;
  totalExtraPrizeAmount: number;
  unpaidExtraPrizeAmount: number;
};

export function createDefaultLatePrizeBoostDecision(): LatePrizeBoostDecision {
  return {
    acceptedAtHoleNumber: null,
    declinedHoleNumbers: [],
    allocations: [],
  };
}

export function normalizeLatePrizeBoostDecision(
  decision: Partial<LatePrizeBoostDecision> | null | undefined
): LatePrizeBoostDecision {
  return {
    acceptedAtHoleNumber:
      typeof decision?.acceptedAtHoleNumber === "number"
        ? decision.acceptedAtHoleNumber
        : null,
    declinedHoleNumbers: Array.isArray(decision?.declinedHoleNumbers)
      ? decision.declinedHoleNumbers.filter(
          (holeNumber): holeNumber is number => typeof holeNumber === "number"
        )
      : [],
    allocations: Array.isArray(decision?.allocations)
      ? decision.allocations.filter(
          (allocation): allocation is LatePrizeBoostAllocation =>
            typeof allocation?.holeId === "string" &&
            typeof allocation.holeNumber === "number" &&
            typeof allocation.extraMainPrizeAmount === "number"
        )
      : [],
  };
}

export function getBaseMainPrizeAmount(settings: BettingSettingsV2): number {
  if (settings.mode === "skins") return settings.skins.amountPerHole;
  if (settings.mode === "vegas") return settings.vegas.amountPerHole;
  if (settings.mode === "hussein") return settings.hussein.amountPerHole;
  if (settings.mode === "school") {
    return settings.school.firstPrizeAmount + settings.school.secondPrizeAmount;
  }
  if (settings.mode === "cycle") {
    return (
      settings.cycle.skinsAmount +
      settings.cycle.husseinAmount +
      settings.cycle.vegasAmount
    );
  }

  return Math.max(0, settings.stroke.amountPerStroke);
}

function createEmptySettlement(players: Player[]): LatePrizeBoostSettlementSummary {
  const playersSummary = players.map((player) => ({
    playerId: player.id,
    totalAmount: 0,
    breakdowns: [] as string[],
  }));

  return {
    byPlayerId: Object.fromEntries(
      playersSummary.map((summary) => [summary.playerId, 0])
    ),
    players: playersSummary,
    totalExtraPrizeAmount: 0,
    unpaidExtraPrizeAmount: 0,
  };
}

function distributeAmountEvenly(params: {
  amount: number;
  winnerPlayerIds: ID[];
  onShare: (playerId: ID, amount: number) => void;
}) {
  const { amount, winnerPlayerIds, onShare } = params;

  if (amount <= 0 || winnerPlayerIds.length === 0) {
    return;
  }

  const baseShare = Math.floor(amount / winnerPlayerIds.length);
  let remainder = amount - baseShare * winnerPlayerIds.length;

  for (const playerId of winnerPlayerIds) {
    const share = baseShare + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    onShare(playerId, share);
  }
}

export function calculateRemainingNearBaseAmount(params: {
  holes: Hole[];
  currentHoleNumber: number;
  nearEnabled: boolean;
  nearAmount: number;
}): number {
  const { holes, currentHoleNumber, nearEnabled, nearAmount } = params;

  if (!nearEnabled || nearAmount <= 0) {
    return 0;
  }

  return holes
    .filter((hole) => hole.holeNumber >= currentHoleNumber && hole.par === 3)
    .reduce((sum) => sum + nearAmount, 0);
}

export function createLatePrizeBoostOffer(params: {
  holes: Hole[];
  currentHole: Hole;
  settings: BettingSettingsV2;
  decision: LatePrizeBoostDecision;
  currentTotalBalance: number;
  remainingExpectedPayout: number;
}): LatePrizeBoostOffer {
  const {
    holes,
    currentHole,
    settings,
    decision,
    currentTotalBalance,
    remainingExpectedPayout,
  } = params;
  const baseMainPrizeAmount = getBaseMainPrizeAmount(settings);
  const remainingHoles = holes
    .filter((hole) => hole.holeNumber >= currentHole.holeNumber)
    .sort((a, b) => a.holeNumber - b.holeNumber);
  const remainingHoleNumbers = remainingHoles.map((hole) => hole.holeNumber);
  const excessAmount = Math.max(0, currentTotalBalance - remainingExpectedPayout);
  const thresholdAmount = baseMainPrizeAmount * remainingHoles.length;
  const alreadyAccepted = decision.acceptedAtHoleNumber !== null;
  const alreadyDeclinedThisHole = decision.declinedHoleNumbers.includes(
    currentHole.holeNumber
  );
  const isOfferHole = currentHole.holeNumber >= 16 && currentHole.holeNumber <= 18;
  const shouldOffer =
    isOfferHole &&
    !alreadyAccepted &&
    !alreadyDeclinedThisHole &&
    baseMainPrizeAmount > 0 &&
    remainingHoles.length > 0 &&
    excessAmount >= thresholdAmount;

  const allocations = shouldOffer
    ? createLatePrizeBoostAllocations({
        remainingHoles,
        baseMainPrizeAmount,
        excessAmount,
      })
    : [];

  return {
    shouldOffer,
    holeNumber: currentHole.holeNumber,
    currentTotalBalance,
    remainingExpectedPayout,
    excessAmount,
    baseMainPrizeAmount,
    remainingHoleNumbers,
    allocations,
    reason: shouldOffer
      ? "잔여 초과 상금을 메인 게임 추가 상금으로 배정할 수 있습니다."
      : "종반전 상금 증액 제안 조건을 만족하지 않습니다.",
  };
}

export function createLatePrizeBoostAllocations(params: {
  remainingHoles: Hole[];
  baseMainPrizeAmount: number;
  excessAmount: number;
}): LatePrizeBoostAllocation[] {
  const { remainingHoles, baseMainPrizeAmount, excessAmount } = params;

  if (remainingHoles.length === 0 || baseMainPrizeAmount <= 0 || excessAmount <= 0) {
    return [];
  }

  const commonMultiple = Math.floor(
    excessAmount / (baseMainPrizeAmount * remainingHoles.length)
  );
  const commonExtraAmount = commonMultiple * baseMainPrizeAmount;
  const usedCommonAmount = commonExtraAmount * remainingHoles.length;
  const remainderAmount = excessAmount - usedCommonAmount;
  const lastIndex = remainingHoles.length - 1;

  return remainingHoles.map((hole, index) => ({
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    extraMainPrizeAmount:
      commonExtraAmount + (index === lastIndex ? remainderAmount : 0),
  }));
}

export function declineLatePrizeBoostOffer(
  decision: LatePrizeBoostDecision,
  holeNumber: number
): LatePrizeBoostDecision {
  if (decision.declinedHoleNumbers.includes(holeNumber)) {
    return decision;
  }

  return {
    ...decision,
    declinedHoleNumbers: [...decision.declinedHoleNumbers, holeNumber],
  };
}

export function acceptLatePrizeBoostOffer(params: {
  decision: LatePrizeBoostDecision;
  offer: LatePrizeBoostOffer;
}): LatePrizeBoostDecision {
  const { decision, offer } = params;

  return {
    ...decision,
    acceptedAtHoleNumber: offer.holeNumber,
    allocations: offer.allocations,
  };
}

export function getLatePrizeBoostAllocationForHole(
  decision: LatePrizeBoostDecision,
  holeId: ID
): LatePrizeBoostAllocation | null {
  return decision.allocations.find((allocation) => allocation.holeId === holeId) ?? null;
}

export function calculateLatePrizeBoostSettlementSummary(params: {
  players: Player[];
  decision: LatePrizeBoostDecision;
  gameResult?: GameResult | null;
}): LatePrizeBoostSettlementSummary {
  const { players, decision, gameResult = null } = params;
  const summary = createEmptySettlement(players);
  const playerSummaryById = new Map(
    summary.players.map((playerSummary) => [playerSummary.playerId, playerSummary])
  );

  for (const allocation of decision.allocations) {
    const amount = Math.max(0, Math.round(allocation.extraMainPrizeAmount));
    if (amount <= 0) continue;

    summary.totalExtraPrizeAmount += amount;

    const holeResult = gameResult?.holeResults.find(
      (result) => result.holeId === allocation.holeId
    );

    if (!holeResult || holeResult.winnerType === "none" || holeResult.winnerPlayerIds.length === 0) {
      summary.unpaidExtraPrizeAmount += amount;
      continue;
    }

    distributeAmountEvenly({
      amount,
      winnerPlayerIds: holeResult.winnerPlayerIds,
      onShare: (playerId, share) => {
        summary.byPlayerId[playerId] = (summary.byPlayerId[playerId] ?? 0) + share;
        const playerSummary = playerSummaryById.get(playerId);

        if (!playerSummary) return;

        playerSummary.totalAmount += share;
        playerSummary.breakdowns.push(
          `${allocation.holeNumber}번 홀 종반전 추가 상금 +${share.toLocaleString()}원`
        );
      },
    });
  }

  return summary;
}
