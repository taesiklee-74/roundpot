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

export type HandicapScoreAdjustment = {
  playerId: string;
  holeId: string;
  holeNumber: number;
  rawStrokes: number;
  adjustedStrokes: number;
  rawScoreToPar: number;
  adjustedScoreToPar: number;
  handicapStroke: number;
};

export function getHandicapScoreAdjustmentsForHole(params: {
  players: Array<{
    id: string;
    handicap?: PlayerHandicapSettings | null;
  }>;
  hole: {
    id: string;
    holeNumber: number;
    par: number;
    handicapRank?: number | null;
  };
  scores: Array<{
    playerId: string;
    holeId: string;
    strokes: number | null;
  }>;
}): HandicapScoreAdjustment[] {
  const { players, hole, scores } = params;

  return players
    .map((player) => {
      const score = scores.find(
        (item) => item.playerId === player.id && item.holeId === hole.id
      );

      if (!score || score.strokes === null) {
        return null;
      }

      const handicapStroke = getHandicapStrokeForHole({
        handicap: player.handicap,
        hole,
      });

      if (handicapStroke <= 0) {
        return null;
      }

      const adjustedStrokes = Math.max(1, score.strokes - handicapStroke);

      return {
        playerId: player.id,
        holeId: hole.id,
        holeNumber: hole.holeNumber,
        rawStrokes: score.strokes,
        adjustedStrokes,
        rawScoreToPar: score.strokes - hole.par,
        adjustedScoreToPar: adjustedStrokes - hole.par,
        handicapStroke,
      };
    })
    .filter((item): item is HandicapScoreAdjustment => item !== null);
}