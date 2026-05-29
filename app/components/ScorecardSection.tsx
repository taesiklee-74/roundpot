"use client";

import type { Hole, Player, Score } from "../../src/lib/betting/types";

type ScorecardSectionProps = {
  players: Player[];
  holes: Hole[];
  scores: Score[];
  holeCount: 9 | 18;
  getSavedScoreToPar: (
    scores: Score[],
    hole: Hole,
    playerId: string
  ) => number | null;
  getPlayerScoreTotalToPar: (params: {
    scores: Score[];
    holes: Hole[];
    playerId: string;
    fromHoleNumber: number;
    toHoleNumber: number;
  }) => number | null;
  formatScoreToPar: (scoreToPar: number) => string;
};

export default function ScorecardSection({
  players,
  holes,
  scores,
  holeCount,
  getSavedScoreToPar,
  getPlayerScoreTotalToPar,
  formatScoreToPar,
}: ScorecardSectionProps) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">전체 스코어카드</h2>
      <p className="mt-1 text-sm text-neutral-500">
        홀별 표시는 Par 기준입니다. 예: 0은 파, +1은 보기, -1은 버디
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">홀</th>
              <th className="py-2 text-center">Par</th>
              {players.map((player) => (
                <th key={player.id} className="py-2 text-center">
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holes.map((hole) => (
              <tr key={hole.id} className="border-b">
                <td className="py-2">{hole.holeNumber}</td>
                <td className="py-2 text-center">{hole.par}</td>
                {players.map((player) => {
                  const scoreToPar = getSavedScoreToPar(scores, hole, player.id);

                  return (
                    <td key={player.id} className="py-2 text-center">
                      {scoreToPar === null ? "-" : formatScoreToPar(scoreToPar)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
        <h3 className="font-bold">스코어 합계</h3>
        <p className="mt-1 text-xs text-neutral-500">
          저장된 홀 기준 Par 대비 합계입니다.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">플레이어</th>
                <th className="py-2 text-center">전반</th>
                <th className="py-2 text-center">후반</th>
                <th className="py-2 text-center">전체</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const frontTotal = getPlayerScoreTotalToPar({
                  scores,
                  holes,
                  playerId: player.id,
                  fromHoleNumber: 1,
                  toHoleNumber: Math.min(9, holeCount),
                });

                const backTotal =
                  holeCount === 18
                    ? getPlayerScoreTotalToPar({
                        scores,
                        holes,
                        playerId: player.id,
                        fromHoleNumber: 10,
                        toHoleNumber: 18,
                      })
                    : null;

                const overallTotal = getPlayerScoreTotalToPar({
                  scores,
                  holes,
                  playerId: player.id,
                  fromHoleNumber: 1,
                  toHoleNumber: holeCount,
                });

                return (
                  <tr key={player.id} className="border-b last:border-b-0">
                    <td className="py-2 font-semibold">{player.name}</td>
                    <td className="py-2 text-center font-bold">
                      {frontTotal === null ? "-" : formatScoreToPar(frontTotal)}
                    </td>
                    <td className="py-2 text-center font-bold">
                      {holeCount === 18
                        ? backTotal === null
                          ? "-"
                          : formatScoreToPar(backTotal)
                        : "-"}
                    </td>
                    <td className="py-2 text-center text-base font-black text-blue-700">
                      {overallTotal === null
                        ? "-"
                        : formatScoreToPar(overallTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}