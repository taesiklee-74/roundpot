export type NearGameKind = "stroke" | "skins" | "vegas" | "hussein" | "school";

export type NearResult = {
  holeId: string;
  holeNumber: number;
  gameKind: NearGameKind;
  winnerPlayerId: string | null;
  amount: number;
};

export type NearPreviewLike = unknown;

export function getNearResultForHole(
  nearResults: NearResult[],
  holeId: string
): NearResult | null {
  return nearResults.find((result) => result.holeId === holeId) ?? null;
}

function getPreviewInnerGameType(
  preview: NearPreviewLike
): "skins" | "hussein" | "vegas" | null {
  if (!preview || typeof preview !== "object") {
    return null;
  }

  if (!("innerGameType" in preview)) {
    return null;
  }

  const innerGameType = preview.innerGameType;

  if (
    innerGameType === "skins" ||
    innerGameType === "hussein" ||
    innerGameType === "vegas"
  ) {
    return innerGameType;
  }

  return null;
}

export function getNearGameKindFromPreview(
  mode: string,
  preview: NearPreviewLike
): NearGameKind {
  const innerGameType = getPreviewInnerGameType(preview);

  if (innerGameType) {
    return innerGameType;
  }

  if (
    mode === "stroke" ||
    mode === "skins" ||
    mode === "vegas" ||
    mode === "hussein" ||
    mode === "school"
  ) {
    return mode;
  }

  return "stroke";
}

export function upsertNearResult(params: {
  nearResults: NearResult[];
  hole: {
    id: string;
    holeNumber: number;
  };
  gameKind: NearGameKind;
  winnerPlayerId: string | null;
  amount: number;
}): NearResult[] {
  const { nearResults, hole, gameKind, winnerPlayerId, amount } = params;

  const nextResult: NearResult = {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameKind,
    winnerPlayerId,
    amount,
  };

  const existingIndex = nearResults.findIndex(
    (result) => result.holeId === hole.id
  );

  if (existingIndex === -1) {
    return [...nearResults, nextResult];
  }

  return nearResults.map((result, index) =>
    index === existingIndex ? nextResult : result
  );
}

export type NearPlayerSettlement = {
  playerId: string;
  totalAmount: number;
  receivedAmount: number;
  paidAmount: number;
  breakdowns: string[];
};

export type NearTeamAssignmentLike = {
  holeId: string;
  teams: Array<{
    playerIds: string[];
  }>;
};

export type NearSettlementSummary = {
  players: NearPlayerSettlement[];
  byPlayerId: Record<string, NearPlayerSettlement>;
  totalPool: number;
  contributionPerPlayer: number;
  paidAmount: number;
  remainingPool: number;
};

function createEmptyNearSettlement(params: {
  playerIds: string[];
  totalPool: number;
}): NearSettlementSummary {
  const { playerIds, totalPool } = params;

  const players = playerIds.map((playerId) => ({
    playerId,
    totalAmount: 0,
    receivedAmount: 0,
    paidAmount: 0,
    breakdowns: [],
  }));

  return {
    players,
    byPlayerId: Object.fromEntries(
      players.map((playerSettlement) => [
        playerSettlement.playerId,
        playerSettlement,
      ])
    ),
    totalPool,
    contributionPerPlayer:
      playerIds.length > 0 ? totalPool / playerIds.length : 0,
    paidAmount: 0,
    remainingPool: totalPool,
  };
}

function addNearPrize(params: {
  summary: NearSettlementSummary;
  playerId: string;
  amount: number;
  reason: string;
}) {
  const { summary, playerId, amount, reason } = params;
  const playerSettlement = summary.byPlayerId[playerId];

  if (!playerSettlement || amount <= 0) {
    return;
  }

  playerSettlement.totalAmount += amount;
  playerSettlement.receivedAmount += amount;
  playerSettlement.breakdowns.push(reason);

  summary.paidAmount += amount;
  summary.remainingPool = Math.max(0, summary.totalPool - summary.paidAmount);
}

function findVegasNearWinnerTeam(params: {
  result: NearResult;
  assignments: NearTeamAssignmentLike[];
}) {
  const { result, assignments } = params;
  const winnerPlayerId = result.winnerPlayerId;

  if (!winnerPlayerId) {
    return null;
  }

  const assignment = assignments.find((item) => item.holeId === result.holeId);

  if (!assignment) {
    return null;
  }

  const winnerTeam = assignment.teams.find((team) =>
    team.playerIds.includes(winnerPlayerId)
  );

  if (!winnerTeam) {
    return null;
  }

  return winnerTeam;
}

export function calculateNearSettlementSummary(params: {
  playerIds: string[];
  nearEnabled: boolean;
  nearAmount: number;
  nearResults: NearResult[];
  vegasTeamAssignments?: NearTeamAssignmentLike[];
  nearHoleCount?: number;
}): NearSettlementSummary {
  const {
    playerIds,
    nearEnabled,
    nearAmount,
    nearResults,
    vegasTeamAssignments = [],
    nearHoleCount = 4,
  } = params;

  const totalPool = nearEnabled ? nearAmount * nearHoleCount : 0;

  const summary = createEmptyNearSettlement({
    playerIds,
    totalPool,
  });

  if (!nearEnabled || nearAmount <= 0) {
    return summary;
  }

  nearResults.forEach((result) => {
    if (!result.winnerPlayerId || result.amount <= 0) {
      return;
    }

    if (result.gameKind === "vegas") {
      const winnerTeam = findVegasNearWinnerTeam({
        result,
        assignments: vegasTeamAssignments,
      });

      if (!winnerTeam || winnerTeam.playerIds.length === 0) {
        return;
      }

      const amountPerTeamMember = result.amount / winnerTeam.playerIds.length;

      winnerTeam.playerIds.forEach((playerId) => {
        addNearPrize({
          summary,
          playerId,
          amount: amountPerTeamMember,
          reason: `${result.holeNumber}번 홀 라스베가스 팀 니어 수령`,
        });
      });

      return;
    }

    addNearPrize({
      summary,
      playerId: result.winnerPlayerId,
      amount: result.amount,
      reason: `${result.holeNumber}번 홀 니어 수령`,
    });
  });

  summary.remainingPool = Math.max(0, summary.totalPool - summary.paidAmount);

  return summary;
}