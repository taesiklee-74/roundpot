// src/lib/betting/school.ts
// 라운드팟 학교 계산 엔진
// 규칙 요약:
// - 기본적으로 스킨스 변형
// - 매 홀 1등 상금과 2등 상금을 따로 지급
// - 1등이 동률이면 1등 상금만 이월
// - 단독 1등은 1등 상금 수령
// - 2등 또는 다음 등수 후보가 단독이면 2등 상금 수령
// - 2등 또는 다음 등수 후보가 다수이면 2등 상금만 이월
// - 현재 이월 상태를 "n학년 m반"으로 표시

import {
  createZeroTotals,
  getCompletedHoles,
  getPlayerStrokes,
  type CurrentGamePreview,
  type GameResult,
  type Hole,
  type HoleGameResult,
  type Player,
  type Score,
  type SchoolSettings,
} from "./types";

type SchoolCalculationInput = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: SchoolSettings;
};

type PlayerHoleStanding = {
  player: Player;
  strokes: number;
};

type RankGroup = {
  rankLabel: number;
  strokes: number;
  entries: PlayerHoleStanding[];
};

export type SchoolHoleResult = HoleGameResult & {
  firstPrizeAmount: number;
  secondPrizeAmount: number;
  firstPrizeWinnerPlayerIds: string[];
  secondPrizeWinnerPlayerIds: string[];
  firstPrizeTiedPlayerIds: string[];
  secondPrizeTiedPlayerIds: string[];
  firstPrizeCarriedIn: number;
  secondPrizeCarriedIn: number;
  firstPrizeCarriedOut: number;
  secondPrizeCarriedOut: number;
  firstGrade: number;
  secondClass: number;
};

export type SchoolGameResult = GameResult & {
  schoolHoleResults: SchoolHoleResult[];
  firstPrizeCarryOver: number;
  secondPrizeCarryOver: number;
  firstPrizeCarryCount: number;
  secondPrizeCarryCount: number;
  schoolLabel: string;
};

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

function groupByRank(standings: PlayerHoleStanding[]): RankGroup[] {
  const groups: RankGroup[] = [];
  let consumedPlayers = 0;

  for (const standing of standings) {
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.strokes !== standing.strokes) {
      const rankLabel = consumedPlayers + 1;
      groups.push({
        rankLabel,
        strokes: standing.strokes,
        entries: [standing],
      });
    } else {
      lastGroup.entries.push(standing);
    }

    consumedPlayers += 1;
  }

  return groups;
}

function getNextRankGroupAfterFirst(groups: RankGroup[]): RankGroup | null {
  if (groups.length < 2) return null;
  return groups[1];
}

function getSchoolLabel(firstPrizeCarryCount: number, secondPrizeCarryCount: number): string {
  return `${firstPrizeCarryCount + 1}학년 ${secondPrizeCarryCount + 1}반`;
}

function formatPrize(amount: number): string {
  return `${amount.toLocaleString()}원`;
}

function createSchoolHoleResult(params: {
  hole: Hole;
  settings: SchoolSettings;
  standings: PlayerHoleStanding[];
  firstPrizeCarriedIn: number;
  secondPrizeCarriedIn: number;
  firstPrizeCarryCountBefore: number;
  secondPrizeCarryCountBefore: number;
}): SchoolHoleResult {
  const {
    hole,
    settings,
    standings,
    firstPrizeCarriedIn,
    secondPrizeCarriedIn,
    firstPrizeCarryCountBefore,
    secondPrizeCarryCountBefore,
  } = params;

  const groups = groupByRank(standings);
  const firstGroup = groups[0];
  const nextGroup = getNextRankGroupAfterFirst(groups);

  const firstPrizeAmount = settings.firstPrizeAmount + firstPrizeCarriedIn;
  const secondPrizeAmount = settings.secondPrizeAmount + secondPrizeCarriedIn;

  const firstPrizeWinnerPlayerIds =
    firstGroup && firstGroup.entries.length === 1
      ? [firstGroup.entries[0].player.id]
      : [];

  const secondPrizeWinnerPlayerIds =
    nextGroup && nextGroup.entries.length === 1
      ? [nextGroup.entries[0].player.id]
      : [];

  const firstPrizePaid = firstPrizeWinnerPlayerIds.length === 1;
  const secondPrizePaid = secondPrizeWinnerPlayerIds.length === 1;
  const firstPrizeTiedPlayerIds =
    !firstPrizePaid && firstGroup && firstGroup.entries.length > 1
      ? firstGroup.entries.map((entry) => entry.player.id)
      : [];
  const secondPrizeTiedPlayerIds =
    !secondPrizePaid && nextGroup && nextGroup.entries.length > 1
      ? nextGroup.entries.map((entry) => entry.player.id)
      : [];

  const firstPrizeCarriedOut =
    firstPrizePaid || !settings.carryOverEnabled ? 0 : firstPrizeAmount;
  const secondPrizeCarriedOut =
    secondPrizePaid || !settings.carryOverEnabled ? 0 : secondPrizeAmount;

  const nextFirstPrizeCarryCount = firstPrizePaid || !settings.carryOverEnabled
    ? 0
    : firstPrizeCarryCountBefore + 1;
  const nextSecondPrizeCarryCount = secondPrizePaid || !settings.carryOverEnabled
    ? 0
    : secondPrizeCarryCountBefore + 1;

  const schoolLabelAfterHole = getSchoolLabel(
    nextFirstPrizeCarryCount,
    nextSecondPrizeCarryCount
  );

  const winnerPlayerIds = [
    ...firstPrizeWinnerPlayerIds,
    ...secondPrizeWinnerPlayerIds,
  ];

  const paidAmount =
    (firstPrizePaid ? firstPrizeAmount : 0) +
    (secondPrizePaid ? secondPrizeAmount : 0);
  const carriedOutAmount = firstPrizeCarriedOut + secondPrizeCarriedOut;

  const displayPrizeAmount = paidAmount > 0 ? paidAmount : carriedOutAmount;

  const firstDescription = firstPrizePaid
    ? `1등 상금 ${formatPrize(firstPrizeAmount)}: ${firstGroup.entries[0].player.name} 수령`
    : settings.carryOverEnabled
    ? `1등 상금 ${formatPrize(firstPrizeAmount)}: ${firstGroup.entries.length}명 동률로 이월`
    : `1등 상금 ${formatPrize(firstPrizeAmount)}: ${firstGroup.entries.length}명 동률로 미지급`;

  const secondDescription = secondPrizePaid && nextGroup
    ? `2등 상금 ${formatPrize(secondPrizeAmount)}: ${nextGroup.entries[0].player.name} 수령`
    : nextGroup
    ? settings.carryOverEnabled
      ? `2등 상금 ${formatPrize(secondPrizeAmount)}: ${nextGroup.rankLabel}등 ${nextGroup.entries.length}명 동률로 이월`
      : `2등 상금 ${formatPrize(secondPrizeAmount)}: ${nextGroup.rankLabel}등 ${nextGroup.entries.length}명 동률로 미지급`
    : settings.carryOverEnabled
    ? `2등 상금 ${formatPrize(secondPrizeAmount)}: 지급 대상 없음으로 이월`
    : `2등 상금 ${formatPrize(secondPrizeAmount)}: 지급 대상 없음으로 미지급`;

  let description = "학교 상금 모두 이월";
  if (paidAmount > 0 && carriedOutAmount > 0) {
    description = "학교 상금 일부 지급";
  } else if (paidAmount > 0) {
    description = "학교 상금 지급";
  } else if (!settings.carryOverEnabled) {
    description = "학교 상금 미지급";
  }

  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    gameType: "school",
    title: `${hole.holeNumber}번 홀 학교`,
    description,
    detail: [
      firstDescription,
      secondDescription,
      `다음 상태: ${schoolLabelAfterHole}`,
    ].join(" · "),
    baseAmount: settings.firstPrizeAmount + settings.secondPrizeAmount,
    carriedIn: firstPrizeCarriedIn + secondPrizeCarriedIn,
    prizeAmount: displayPrizeAmount,
    winnerType: winnerPlayerIds.length > 1
      ? "team"
      : winnerPlayerIds.length === 1
      ? "player"
      : "none",
    winnerPlayerIds,
    // 일부 지급 + 일부 이월인 경우에는 결과 카드 상단에서 지급액이 보이도록 false로 둔다.
    // 이월 내용은 detail과 상금 풀 카드에서 표시한다.
    isCarryOver: paidAmount === 0 && carriedOutAmount > 0,
    tiedPlayerIds: [
      ...new Set([...firstPrizeTiedPlayerIds, ...secondPrizeTiedPlayerIds]),
    ],
    firstPrizeAmount,
    secondPrizeAmount,
    firstPrizeWinnerPlayerIds,
    secondPrizeWinnerPlayerIds,
    firstPrizeTiedPlayerIds,
    secondPrizeTiedPlayerIds,
    firstPrizeCarriedIn,
    secondPrizeCarriedIn,
    firstPrizeCarriedOut,
    secondPrizeCarriedOut,
    firstGrade: nextFirstPrizeCarryCount + 1,
    secondClass: nextSecondPrizeCarryCount + 1,
  };
}

export function calculateSchoolBet({
  players,
  holes,
  scores,
  settings,
}: SchoolCalculationInput): SchoolGameResult {
  const prizeTotals = createZeroTotals(players);

  if (!settings.enabled || players.length < 2) {
    return {
      gameType: "school",
      prizeTotals,
      holeResults: [],
      schoolHoleResults: [],
      remainingCarryOver: 0,
      firstPrizeCarryOver: 0,
      secondPrizeCarryOver: 0,
      firstPrizeCarryCount: 0,
      secondPrizeCarryCount: 0,
      schoolLabel: "1학년 1반",
      poolCollected: 0,
      poolPaid: 0,
    };
  }

  const completedHoles = getCompletedHoles(players, holes, scores);
  const schoolHoleResults: SchoolHoleResult[] = [];

  let firstPrizeCarryOver = 0;
  let secondPrizeCarryOver = 0;
  let firstPrizeCarryCount = 0;
  let secondPrizeCarryCount = 0;
  let poolCollected = 0;
  let poolPaid = 0;

  for (const hole of completedHoles) {
    const standings = getHoleStandings(players, hole, scores);
    if (!standings) continue;

    const holeResult = createSchoolHoleResult({
      hole,
      settings,
      standings,
      firstPrizeCarriedIn: firstPrizeCarryOver,
      secondPrizeCarriedIn: secondPrizeCarryOver,
      firstPrizeCarryCountBefore: firstPrizeCarryCount,
      secondPrizeCarryCountBefore: secondPrizeCarryCount,
    });

    poolCollected += settings.firstPrizeAmount + settings.secondPrizeAmount;

    if (holeResult.firstPrizeWinnerPlayerIds.length === 1) {
      const playerId = holeResult.firstPrizeWinnerPlayerIds[0];
      prizeTotals[playerId] += holeResult.firstPrizeAmount;
      poolPaid += holeResult.firstPrizeAmount;
      firstPrizeCarryOver = 0;
      firstPrizeCarryCount = 0;
    } else if (settings.carryOverEnabled) {
      firstPrizeCarryOver = holeResult.firstPrizeAmount;
      firstPrizeCarryCount += 1;
    } else {
      firstPrizeCarryOver = 0;
      firstPrizeCarryCount = 0;
    }

    if (holeResult.secondPrizeWinnerPlayerIds.length === 1) {
      const playerId = holeResult.secondPrizeWinnerPlayerIds[0];
      prizeTotals[playerId] += holeResult.secondPrizeAmount;
      poolPaid += holeResult.secondPrizeAmount;
      secondPrizeCarryOver = 0;
      secondPrizeCarryCount = 0;
    } else if (settings.carryOverEnabled) {
      secondPrizeCarryOver = holeResult.secondPrizeAmount;
      secondPrizeCarryCount += 1;
    } else {
      secondPrizeCarryOver = 0;
      secondPrizeCarryCount = 0;
    }

    schoolHoleResults.push(holeResult);
  }

  const remainingCarryOver = firstPrizeCarryOver + secondPrizeCarryOver;

  return {
    gameType: "school",
    prizeTotals,
    holeResults: schoolHoleResults,
    schoolHoleResults,
    remainingCarryOver,
    firstPrizeCarryOver,
    secondPrizeCarryOver,
    firstPrizeCarryCount,
    secondPrizeCarryCount,
    schoolLabel: getSchoolLabel(firstPrizeCarryCount, secondPrizeCarryCount),
    poolCollected,
    poolPaid,
  };
}

export function getSchoolCurrentGamePreview(params: {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  settings: SchoolSettings;
}): CurrentGamePreview | null {
  const { players, holes, scores, settings } = params;

  if (!settings.enabled) return null;

  const orderedHoles = holes.slice().sort((a, b) => a.holeNumber - b.holeNumber);
  const completedHoles = getCompletedHoles(players, orderedHoles, scores);
  const completedHoleIds = new Set(completedHoles.map((hole) => hole.id));
  const nextHole = orderedHoles.find((hole) => !completedHoleIds.has(hole.id));

  if (!nextHole) return null;

  const schoolResult = calculateSchoolBet({
    players,
    holes: orderedHoles,
    scores,
    settings,
  });

  const firstPrizeAmount = settings.firstPrizeAmount + schoolResult.firstPrizeCarryOver;
  const secondPrizeAmount = settings.secondPrizeAmount + schoolResult.secondPrizeCarryOver;
  const prizeAmount = firstPrizeAmount + secondPrizeAmount;

  return {
    holeId: nextHole.id,
    holeNumber: nextHole.holeNumber,
    gameType: "school",
    title: `${nextHole.holeNumber}번 홀 학교 · ${schoolResult.schoolLabel}`,
    description: `1등 상금 ${firstPrizeAmount.toLocaleString()}원, 2등 상금 ${secondPrizeAmount.toLocaleString()}원`,
    baseAmount: settings.firstPrizeAmount + settings.secondPrizeAmount,
    carriedIn: schoolResult.remainingCarryOver,
    prizeAmount,
  };
}

export function getSchoolPoolSummary(params: {
  playerCount: number;
  holeCount: number;
  settings: SchoolSettings;
  result: SchoolGameResult;
}) {
  const { playerCount, holeCount, settings, result } = params;
  const totalPool = (settings.firstPrizeAmount + settings.secondPrizeAmount) * holeCount;
  const contributionPerPlayer = playerCount > 0 ? totalPool / playerCount : 0;

  return {
    totalPool,
    contributionPerPlayer,
    poolCollected: result.poolCollected,
    poolPaid: result.poolPaid,
    remainingCarryOver: result.remainingCarryOver,
    firstPrizeCarryOver: result.firstPrizeCarryOver,
    secondPrizeCarryOver: result.secondPrizeCarryOver,
    schoolLabel: result.schoolLabel,
  };
}

export function getLatestSchoolResult(result: SchoolGameResult): SchoolHoleResult | null {
  return result.schoolHoleResults[result.schoolHoleResults.length - 1] ?? null;
}
