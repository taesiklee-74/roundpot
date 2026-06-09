"use client";

import type { CurrentGamePreview, Player } from "../../src/lib/betting/types";
import type {
  HandicapEligiblePlayerForHole,
  HandicapScoreAdjustment,
} from "../../src/lib/betting/handicap";

type CurrentGamePreviewCardProps = {
  preview: CurrentGamePreview | null;
  players: Player[];
  formatPlainAmount: (amount: number) => string;
  formatTeam: (players: Player[], playerIds: string[]) => string;
  getPlayerName: (players: Player[], playerId: string) => string;
  handicapAdjustments: HandicapScoreAdjustment[];
  handicapEligiblePlayers: HandicapEligiblePlayerForHole[];
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
  handicapEligiblePlayers,
}: CurrentGamePreviewCardProps) {
  if (!preview) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-orange-50 p-5 shadow-sm">
      <h2 className="text-lg font-bold">이번 홀 게임</h2>
      <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
        <p className="font-semibold">{preview.title}</p>
        {preview.gameType !== "hussein" && (
          <p className="mt-1 text-sm text-neutral-600">{preview.description}</p>
        )}
        {handicapEligiblePlayers.length > 0 && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4">
            <h3 className="text-sm font-bold text-amber-900">
              이번 홀 핸디 대상
            </h3>
            <p className="mt-1 text-xs text-amber-800">
              아래 플레이어는 이번 홀 내기 계산에서 1타 차감됩니다.
            </p>

            <div className="mt-3 space-y-2">
              {handicapEligiblePlayers.map((item) => (
                <div
                  key={`${item.holeId}-${item.playerId}`}
                  className="rounded-xl bg-white p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {getPlayerName(players, item.playerId)}
                    </span>
                    <span className="font-bold text-amber-800">
                      -{item.handicapStroke}타
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-neutral-500">
                    적용 조건: {item.reasons.join(", ")}
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

        {preview.teams && preview.teams.length > 0 && !preview.husseinPlayerId && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {preview.teams.map((team) => (
              <div key={team.id} className="rounded-xl bg-white p-3">
                <p className="font-semibold">{team.name}</p>
                <p>{formatTeam(players, team.playerIds)}</p>
              </div>
            ))}
          </div>
        )}

        {preview.gameType === "hussein" && (
          <div className="mt-4 rounded-2xl bg-purple-50 p-4">
            <p className="text-sm font-semibold text-purple-700">
              이번 홀 후세인
            </p>
            <p className="mt-1 text-3xl font-black text-purple-900">
              {preview.husseinPlayerId
                ? getPlayerName(players, preview.husseinPlayerId)
                : "TBD"}
            </p>
            <p className="mt-2 text-sm text-purple-800">
              3명팀:{" "}
              {preview.husseinPlayerId
                ? formatTeam(
                    players,
                    players
                      .filter((player) => player.id !== preview.husseinPlayerId)
                      .map((player) => player.id)
                  )
                : "후세인 선택 후 자동 지정"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}