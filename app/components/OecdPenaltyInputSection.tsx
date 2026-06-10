"use client";

import type {
  Hole,
  HoleOecdPenalty,
  OecdPlayerStatus,
  Player,
} from "../../src/lib/betting/types";
import { getOecdStatusLabel } from "../../src/lib/betting/oecd";

type OecdPenaltyInputSectionProps = {
  enabled: boolean;
  hole: Hole;
  players: Player[];
  statuses: OecdPlayerStatus[];
  penalties: HoleOecdPenalty[];
  formatPlainAmount: (amount: number) => string;
  onChangePenalty: (penalty: HoleOecdPenalty) => void;
};

export default function OecdPenaltyInputSection({
  enabled,
  hole,
  players,
  statuses,
  penalties,
  formatPlainAmount,
  onChangePenalty,
}: OecdPenaltyInputSectionProps) {
  if (!enabled) {
    return null;
  }

  const statusByPlayerId = new Map(statuses.map((status) => [status.playerId, status]));
  const penaltiesByPlayerId = new Map(
    penalties
      .filter((penalty) => penalty.holeId === hole.id)
      .map((penalty) => [penalty.playerId, penalty])
  );
  const targets = statuses.filter((status) => status.isTarget);

  return (
    <section className="rounded-2xl bg-rose-50 p-5 shadow-sm">
      <h2 className="text-lg font-bold text-rose-950">OECD 벌금 입력</h2>
      <p className="mt-1 text-sm text-rose-800">
        OECD 조건은 앱이 자동 판정하지 않습니다. 이번 홀 대상자에게 발생한 벌금을 직접 입력하세요.
      </p>

      {targets.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold text-rose-800">
          이번 홀 OECD 대상자가 없습니다.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {players.map((player) => {
            const status = statusByPlayerId.get(player.id) ?? null;
            const isTarget = status?.isTarget === true;
            const currentPenalty = penaltiesByPlayerId.get(player.id)?.amount ?? 0;

            return (
              <div
                key={player.id}
                className={`rounded-xl p-3 ${isTarget ? "bg-white" : "bg-white/60"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{player.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {getOecdStatusLabel(status)}
                      {status
                        ? ` · 홀 시작 전 누적 ${formatPlainAmount(status.cumulativeBeforeHole)}`
                        : ""}
                    </p>
                  </div>
                  <input
                    type="number"
                    className="w-28 rounded-xl border border-rose-200 px-3 py-2 text-right text-sm font-bold outline-none focus:border-rose-700 disabled:bg-neutral-100 disabled:text-neutral-400"
                    value={currentPenalty || ""}
                    min={0}
                    step={1000}
                    placeholder="0"
                    disabled={!isTarget}
                    onChange={(event) =>
                      onChangePenalty({
                        holeId: hole.id,
                        holeNumber: hole.holeNumber,
                        playerId: player.id,
                        amount: Number(event.target.value || 0),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
