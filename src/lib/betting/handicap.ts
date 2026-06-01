export type HandicapParValue = 3 | 4 | 5;

export type PlayerHandicapSettings = {
  enabled: boolean;
  parValues: HandicapParValue[];
  topHandicapHoleCount: number;
};

export type HandicapHoleLike = {
  par: number;
  handicapRank?: number | null;
};

export function getHandicapStrokeForHole(params: {
  handicap: PlayerHandicapSettings | undefined | null;
  hole: HandicapHoleLike;
}): number {
  const { handicap, hole } = params;

  if (!handicap?.enabled) {
    return 0;
  }

  const matchesPar =
    hole.par === 3 || hole.par === 4 || hole.par === 5
      ? handicap.parValues.includes(hole.par)
      : false;

  const matchesHandicapRank =
    typeof hole.handicapRank === "number" &&
    handicap.topHandicapHoleCount > 0 &&
    hole.handicapRank >= 1 &&
    hole.handicapRank <= handicap.topHandicapHoleCount;

  return matchesPar || matchesHandicapRank ? 1 : 0;
}

export function getAdjustedScoreToPar(params: {
  rawScoreToPar: number;
  handicapStroke: number;
}): number {
  const { rawScoreToPar, handicapStroke } = params;

  return rawScoreToPar - handicapStroke;
}

export function getHandicapDescription(params: {
  handicap: PlayerHandicapSettings | undefined | null;
}): string {
  const { handicap } = params;

  if (!handicap?.enabled) {
    return "핸디 없음";
  }

  const parts: string[] = [];

  if (handicap.parValues.length > 0) {
    parts.push(`파${handicap.parValues.join("/파")} 홀`);
  }

  if (handicap.topHandicapHoleCount > 0) {
    parts.push(`핸디캡 상위 ${handicap.topHandicapHoleCount}개 홀`);
  }

  if (parts.length === 0) {
    return "핸디 없음";
  }

  return `${parts.join(", ")}에서 1타 차감`;
}