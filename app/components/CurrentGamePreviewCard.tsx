"use client";

import type { CurrentGamePreview, Player } from "../../src/lib/betting/types";
import type { HandicapScoreAdjustment } from "../../src/lib/betting/handicap";

type CurrentGamePreviewCardProps = {
  preview: CurrentGamePreview | null;
  players: Player[];
  formatPlainAmount: (amount: number) => string;
  formatTeam: (players: Player[], playerIds: string[]) => string;
  getPlayerName: (players: Player[], playerId: string) => string;
  handicapAdjustments: HandicapScoreAdjustment[];
};

function formatScoreToParForDisplay(scoreToPar: number): string {
  if (scoreToPar === 0) {
    return "0";
  }

  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

export default function CurrentGamePreviewCard({
  preview,
  players,
  formatPlainAmount,
  formatTeam,
  getPlayerName,
  handicapAdjustments,
}: CurrentGamePreviewCardProps) {
  if (!preview) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">이번 홀 게임</h2>
      <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
        <p className="font-semibold">{preview.title}</p>
        <p className="mt-1 text-sm text-neutral-600">{preview.description}</p>
        {handicapAdjustments.length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4">
            <h3 className="text-sm font-bold text-amber-900">
              이번 홀 핸디 적용
            </h3>
            <p className="mt-1 text-xs text-amber-800">
              스코어카드는 원 스코어 기준이며, 내기 계산에만 아래 핸디가 적용됩니다.
            </p>

            <div className="mt-3 space-y-2">
              {handicapAdjustments.map((adjustment) => (
                <div
                  key={`${adjustment.holeId}-${adjustment.playerId}`}
                  className="rounded-xl bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {getPlayerName(players, adjustment.playerId)}
                    </span>
                    <span className="font-bold text-amber-800">
                      {formatScoreToParForDisplay(adjustment.rawScoreToPar)} →{" "}
                      {formatScoreToParForDisplay(adjustment.adjustedScoreToPar)}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-neutral-500">
                    원 스코어 {formatScoreToParForDisplay(adjustment.rawScoreToPar)}
                    에서 핸디 {adjustment.handicapStroke}타 차감
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {preview.prizeAmount > 0 && (
          <div className="mt-4 rounded-2xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-700">이번 홀 상금</p>
            <p className="mt-1 text-3xl font-black text-blue-700">
              {formatPlainAmount(preview.prizeAmount)}
            </p>
          </div>
        )}

        {preview.teams && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {preview.teams.map((team) => (
              <div key={team.id} className="rounded-xl bg-white p-3">
                <p className="font-semibold">{team.name}</p>
                <p>{formatTeam(players, team.playerIds)}</p>
              </div>
            ))}
          </div>
        )}

        {preview.husseinPlayerId && (
          <div className="mt-4 rounded-2xl bg-purple-50 p-4">
            <p className="text-sm font-semibold text-purple-700">
              이번 홀 후세인
            </p>
            <p className="mt-1 text-3xl font-black text-purple-900">
              {getPlayerName(players, preview.husseinPlayerId)}
            </p>
            <p className="mt-2 text-sm text-purple-800">
              상대팀:{" "}
              {formatTeam(
                players,
                players
                  .filter((player) => player.id !== preview.husseinPlayerId)
                  .map((player) => player.id)
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}