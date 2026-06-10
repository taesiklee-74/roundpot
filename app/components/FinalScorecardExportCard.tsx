"use client";

import ExportRoundScoreButton from "./ExportRoundScoreButton";
import type {
  ExportHoleScore,
  ExportPlayer,
} from "../utils/exportRoundScoreCsv";

type FinalScorecardExportCardProps = {
  courseName?: string;
  playedAt?: string;
  players: ExportPlayer[];
  holes: ExportHoleScore[];
};

export default function FinalScorecardExportCard({
  courseName,
  playedAt,
  players,
  holes,
}: FinalScorecardExportCardProps) {
  const totals = Object.fromEntries(
    players.map((player) => [
      player.id,
      holes.reduce((sum, hole) => {
        const value = hole.scores[player.id];
        return typeof value === "number" ? sum + value : sum;
      }, 0),
    ]),
  ) as Record<string, number>;

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-neutral-900">
            스코어카드
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            핸디캡 미적용 raw score 기준입니다.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="whitespace-nowrap border-b border-neutral-200 px-3 py-2 text-left font-bold text-neutral-600">
                Hole
              </th>
              {players.map((player) => (
                <th
                  key={player.id}
                  className="whitespace-nowrap border-b border-neutral-200 px-3 py-2 text-right font-bold text-neutral-600"
                >
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {holes.map((hole) => (
              <tr key={hole.holeNo}>
                <td className="border-b border-neutral-100 px-3 py-2 font-bold text-neutral-700">
                  {hole.holeNo}
                </td>
                {players.map((player) => (
                  <td
                    key={player.id}
                    className="border-b border-neutral-100 px-3 py-2 text-right text-neutral-900"
                  >
                    {hole.scores[player.id] ?? ""}
                  </td>
                ))}
              </tr>
            ))}

            <tr className="bg-neutral-50">
              <td className="px-3 py-2 font-extrabold text-neutral-900">
                Total
              </td>
              {players.map((player) => (
                <td
                  key={player.id}
                  className="px-3 py-2 text-right font-extrabold text-neutral-900"
                >
                  {totals[player.id]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <ExportRoundScoreButton
          courseName={courseName}
          playedAt={playedAt}
          players={players}
          holes={holes}
        />
      </div>
    </section>
  );
}