// roundpot/calculators.ts
// 라운드팟 MVP 계산 엔진
// 역할: 스코어, 순위, 스트로크 내기, 스킨스 내기, 최종 정산 계산

export type ID = string;

export type Player = {
  id: ID;
  name: string;
  handicap?: number;
  order?: number;
};

export type Hole = {
  id: ID;
  holeNumber: number;
  par: 3 | 4 | 5;
};

export type Score = {
  holeId: ID;
  playerId: ID;
  strokes: number | null;
};

export type BettingSettings = {
  strokeEnabled: boolean;
  strokeAmountPerShot: number;
  skinsEnabled: boolean;
  skinsAmountPerHole: number;
  carryOverEnabled: boolean;
  handicapEnabled: boolean;
};

export type PlayerScoreSummary = {
  playerId: ID;
  playerName: string;
  holesPlayed: number;
  totalStrokes: number;
  totalPar: number;
  scoreToPar: number;
  frontNineTotal: number;
  backNineTotal: number;
  handicap: number;
  netStrokes: number;
};

export type RankingResult = PlayerScoreSummary & {
  rank: number | null;
};

export type PairwiseSettlement = {
  fromPlayerId: ID;
  toPlayerId: ID;
  amount: number;
  reason: string;
};

export type StrokeBetResult = {
  totals: Record<ID, number>;
  pairwiseSettlements: PairwiseSettlement[];
};

export type SkinsHoleResult = {
  holeId: ID;
  holeNumber: number;
  baseAmount: number;
  carriedIn: number;
  prizeAmount: number;
  winnerPlayerId: ID | null;
  isCarryOver: boolean;
  tiedPlayerIds: ID[];
};

export type SkinsBetResult = {
  totals: Record<ID, number>;
  holeResults: SkinsHoleResult[];
  remainingCarryOver: number;
};

export type SettlementSummary = {
  playerId: ID;
  playerName: string;
  strokeAmount: number;
  skinsAmount: number;
  totalAmount: number;
};

export type RoundCalculationResult = {
  scoreSummaries: PlayerScoreSummary[];
  rankings: RankingResult[];
  strokeBet: StrokeBetResult;
  skinsBet: SkinsBetResult;
  settlement: SettlementSummary[];
};

function getScoreKey(holeId: ID, playerId: ID): string {
  return `${holeId}:${playerId}`;
}

function buildScoreMap(scores: Score[]): Map<string, Score> {
  const scoreMap = new Map<string, Score>();

  for (const score of scores) {
    scoreMap.set(getScoreKey(score.holeId, score.playerId), score);
  }

  return scoreMap;
}

function assertPositiveAmount(amount: number, fieldName: string): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }
}

function createZeroTotals(players: Player[]): Record<ID, number> {
  return players.reduce<Record<ID, number>>((acc, player) => {
    acc[player.id] = 0;
    return acc;
  }, {});
}

export function calculateScoreSummaries(
  players: Player[],
  holes: Hole[],
  scores: Score[],
  handicapEnabled = false
): PlayerScoreSummary[] {
  const orderedHoles = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);
  const scoreMap = buildScoreMap(scores);

  return players.map((player) => {
    let holesPlayed = 0;
    let totalStrokes = 0;
    let totalPar = 0;
    let frontNineTotal = 0;
    let backNineTotal = 0;

    for (const hole of orderedHoles) {
      const score = scoreMap.get(getScoreKey(hole.id, player.id));

      if (!score || score.strokes === null || score.strokes === undefined) {
        continue;
      }

      if (!Number.isInteger(score.strokes) || score.strokes <= 0) {
        throw new Error(
          `Invalid strokes for player ${player.id} on hole ${hole.id}.`
        );
      }

      holesPlayed += 1;
      totalStrokes += score.strokes;
      totalPar += hole.par;

      if (hole.holeNumber <= 9) {
        frontNineTotal += score.strokes;
      } else {
        backNineTotal += score.strokes;
      }
    }

    const handicap = handicapEnabled ? player.handicap ?? 0 : 0;
    const netStrokes = totalStrokes - handicap;

    return {
      playerId: player.id,
      playerName: player.name,
      holesPlayed,
      totalStrokes,
      totalPar,
      scoreToPar: totalStrokes - totalPar,
      frontNineTotal,
      backNineTotal,
      handicap,
      netStrokes,
    };
  });
}

export function calculateRankings(
  scoreSummaries: PlayerScoreSummary[],
  useNetScore = false
): RankingResult[] {
  const rankedInput = scoreSummaries.filter((summary) => summary.holesPlayed > 0);
  const unplayedInput = scoreSummaries.filter((summary) => summary.holesPlayed === 0);

  const sorted = [...rankedInput].sort((a, b) => {
    const aScore = useNetScore ? a.netStrokes : a.totalStrokes;
    const bScore = useNetScore ? b.netStrokes : b.totalStrokes;

    if (aScore !== bScore) return aScore - bScore;
    if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
    return a.playerName.localeCompare(b.playerName);
  });

  const rankings: RankingResult[] = [];
  let previousScore: number | null = null;
  let previousRank = 0;

  sorted.forEach((summary, index) => {
    const currentScore = useNetScore ? summary.netStrokes : summary.totalStrokes;
    const rank = currentScore === previousScore ? previousRank : index + 1;

    rankings.push({
      ...summary,
      rank,
    });

    previousScore = currentScore;
    previousRank = rank;
  });

  for (const summary of unplayedInput) {
    rankings.push({
      ...summary,
      rank: null,
    });
  }

  return rankings;
}

export function calculateStrokeBet(
  players: Player[],
  scoreSummaries: PlayerScoreSummary[],
  amountPerStroke: number,
  useNetScore = false
): StrokeBetResult {
  assertPositiveAmount(amountPerStroke, 'amountPerStroke');

  const totals = createZeroTotals(players);
  const pairwiseSettlements: PairwiseSettlement[] = [];
  const summaryByPlayerId = new Map(scoreSummaries.map((summary) => [summary.playerId, summary]));

  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const playerA = players[i];
      const playerB = players[j];
      const summaryA = summaryByPlayerId.get(playerA.id);
      const summaryB = summaryByPlayerId.get(playerB.id);

      if (!summaryA || !summaryB) continue;
      if (summaryA.holesPlayed === 0 || summaryB.holesPlayed === 0) continue;

      const comparableHolesPlayed = Math.min(summaryA.holesPlayed, summaryB.holesPlayed);
      if (comparableHolesPlayed === 0) continue;

      const scoreA = useNetScore ? summaryA.netStrokes : summaryA.totalStrokes;
      const scoreB = useNetScore ? summaryB.netStrokes : summaryB.totalStrokes;
      const diff = scoreA - scoreB;

      if (diff === 0) continue;

      const amount = Math.abs(diff) * amountPerStroke;
      const winner = diff < 0 ? playerA : playerB;
      const loser = diff < 0 ? playerB : playerA;

      totals[winner.id] += amount;
      totals[loser.id] -= amount;

      pairwiseSettlements.push({
        fromPlayerId: loser.id,
        toPlayerId: winner.id,
        amount,
        reason: `스트로크 ${Math.abs(diff)}타 차이`,
      });
    }
  }

  return {
    totals,
    pairwiseSettlements,
  };
}

export function calculateSkinsBet(
  players: Player[],
  holes: Hole[],
  scores: Score[],
  amountPerHole: number,
  carryOverEnabled: boolean
): SkinsBetResult {
  assertPositiveAmount(amountPerHole, 'amountPerHole');

  const totals = createZeroTotals(players);
  const scoreMap = buildScoreMap(scores);
  const orderedHoles = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);
  const holeResults: SkinsHoleResult[] = [];
  let carryOverAmount = 0;

  for (const hole of orderedHoles) {
    const scoredPlayers = players
      .map((player) => {
        const score = scoreMap.get(getScoreKey(hole.id, player.id));
        return {
          player,
          strokes: score?.strokes ?? null,
        };
      })
      .filter((entry) => entry.strokes !== null) as Array<{
      player: Player;
      strokes: number;
    }>;

    if (scoredPlayers.length < players.length) {
      break;
    }

    const minStrokes = Math.min(...scoredPlayers.map((entry) => entry.strokes));
    const winners = scoredPlayers.filter((entry) => entry.strokes === minStrokes);
    const prizeAmount = amountPerHole + carryOverAmount;

    if (winners.length === 1) {
      const winner = winners[0].player;
      totals[winner.id] += prizeAmount;

      holeResults.push({
        holeId: hole.id,
        holeNumber: hole.holeNumber,
        baseAmount: amountPerHole,
        carriedIn: carryOverAmount,
        prizeAmount,
        winnerPlayerId: winner.id,
        isCarryOver: false,
        tiedPlayerIds: [],
      });

      carryOverAmount = 0;
    } else {
      holeResults.push({
        holeId: hole.id,
        holeNumber: hole.holeNumber,
        baseAmount: amountPerHole,
        carriedIn: carryOverAmount,
        prizeAmount,
        winnerPlayerId: null,
        isCarryOver: carryOverEnabled,
        tiedPlayerIds: winners.map((entry) => entry.player.id),
      });

      if (carryOverEnabled) {
        carryOverAmount = prizeAmount;
      } else {
        carryOverAmount = 0;
      }
    }
  }

  // 스킨스는 상금을 winner에게 더하는 방식으로 먼저 계산한다.
  // 실제 정산은 전체 참여자가 홀 상금을 균등 부담한다고 보고 0합으로 변환한다.
  const totalWon = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const costPerPlayer = players.length > 0 ? totalWon / players.length : 0;

  for (const player of players) {
    totals[player.id] -= costPerPlayer;
  }

  return {
    totals,
    holeResults,
    remainingCarryOver: carryOverAmount,
  };
}

export function calculateSettlement(
  players: Player[],
  strokeBet: StrokeBetResult,
  skinsBet: SkinsBetResult
): SettlementSummary[] {
  return players.map((player) => {
    const strokeAmount = strokeBet.totals[player.id] ?? 0;
    const skinsAmount = skinsBet.totals[player.id] ?? 0;

    return {
      playerId: player.id,
      playerName: player.name,
      strokeAmount,
      skinsAmount,
      totalAmount: strokeAmount + skinsAmount,
    };
  });
}

export function validateZeroSum(settlement: SettlementSummary[]): boolean {
  const total = settlement.reduce((sum, item) => sum + item.totalAmount, 0);
  return Math.abs(total) < 0.0001;
}

export function calculateRound(
  players: Player[],
  holes: Hole[],
  scores: Score[],
  bettingSettings: BettingSettings
): RoundCalculationResult {
  const scoreSummaries = calculateScoreSummaries(
    players,
    holes,
    scores,
    bettingSettings.handicapEnabled
  );

  const rankings = calculateRankings(scoreSummaries, bettingSettings.handicapEnabled);

  const strokeBet = bettingSettings.strokeEnabled
    ? calculateStrokeBet(
        players,
        scoreSummaries,
        bettingSettings.strokeAmountPerShot,
        bettingSettings.handicapEnabled
      )
    : {
        totals: createZeroTotals(players),
        pairwiseSettlements: [],
      };

  const skinsBet = bettingSettings.skinsEnabled
    ? calculateSkinsBet(
        players,
        holes,
        scores,
        bettingSettings.skinsAmountPerHole,
        bettingSettings.carryOverEnabled
      )
    : {
        totals: createZeroTotals(players),
        holeResults: [],
        remainingCarryOver: 0,
      };

  const settlement = calculateSettlement(players, strokeBet, skinsBet);

  if (!validateZeroSum(settlement)) {
    throw new Error('Settlement is not zero-sum. Please check calculation logic.');
  }

  return {
    scoreSummaries,
    rankings,
    strokeBet,
    skinsBet,
    settlement,
  };
}

export type PlayerAnalysis = {
  playerId: ID;
  playerName: string;
  eagleOrBetter: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleOrWorse: number;
};

export function calculatePlayerAnalysis(
  players: Player[],
  holes: Hole[],
  scores: Score[]
): PlayerAnalysis[] {
  const scoreMap = buildScoreMap(scores);
  const orderedHoles = [...holes].sort((a, b) => a.holeNumber - b.holeNumber);

  return players.map((player) => {
    const analysis: PlayerAnalysis = {
      playerId: player.id,
      playerName: player.name,
      eagleOrBetter: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubleBogeys: 0,
      tripleOrWorse: 0,
    };

    for (const hole of orderedHoles) {
      const score = scoreMap.get(getScoreKey(hole.id, player.id));
      if (!score || score.strokes === null || score.strokes === undefined) continue;

      const scoreToPar = score.strokes - hole.par;

      if (scoreToPar <= -2) analysis.eagleOrBetter += 1;
      else if (scoreToPar === -1) analysis.birdies += 1;
      else if (scoreToPar === 0) analysis.pars += 1;
      else if (scoreToPar === 1) analysis.bogeys += 1;
      else if (scoreToPar === 2) analysis.doubleBogeys += 1;
      else analysis.tripleOrWorse += 1;
    }

    return analysis;
  });
}

// 샘플 데이터와 간단 테스트
// 실제 프로젝트에서는 Vitest/Jest 테스트 파일로 분리하는 것을 권장한다.

const samplePlayers: Player[] = [
  { id: 'p1', name: '나' },
  { id: 'p2', name: '김프로' },
  { id: 'p3', name: '박싱글' },
  { id: 'p4', name: '이보기' },
];

const sampleHoles: Hole[] = [
  { id: 'h1', holeNumber: 1, par: 4 },
  { id: 'h2', holeNumber: 2, par: 3 },
  { id: 'h3', holeNumber: 3, par: 5 },
];

const sampleScores: Score[] = [
  { holeId: 'h1', playerId: 'p1', strokes: 5 },
  { holeId: 'h1', playerId: 'p2', strokes: 4 },
  { holeId: 'h1', playerId: 'p3', strokes: 6 },
  { holeId: 'h1', playerId: 'p4', strokes: 5 },

  { holeId: 'h2', playerId: 'p1', strokes: 3 },
  { holeId: 'h2', playerId: 'p2', strokes: 4 },
  { holeId: 'h2', playerId: 'p3', strokes: 3 },
  { holeId: 'h2', playerId: 'p4', strokes: 5 },

  { holeId: 'h3', playerId: 'p1', strokes: 5 },
  { holeId: 'h3', playerId: 'p2', strokes: 5 },
  { holeId: 'h3', playerId: 'p3', strokes: 6 },
  { holeId: 'h3', playerId: 'p4', strokes: 7 },
];

const sampleBettingSettings: BettingSettings = {
  strokeEnabled: true,
  strokeAmountPerShot: 1000,
  skinsEnabled: true,
  skinsAmountPerHole: 4000,
  carryOverEnabled: true,
  handicapEnabled: false,
};

export function runSampleCalculation(): RoundCalculationResult {
  return calculateRound(samplePlayers, sampleHoles, sampleScores, sampleBettingSettings);
}
