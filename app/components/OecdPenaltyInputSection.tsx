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
  penaltyUnitAmount: number;
  formatPlainAmount: (amount: number) => string;
  onChangePenalty: (penalty: HoleOecdPenalty) => void;
};

export default function OecdPenaltyInputSection({
  enabled,
  hole,
  players,
  statuses,
  penalties,
  penaltyUnitAmount,
  formatPlainAmount,
  onChangePenalty,
}: OecdPenaltyInputSectionProps) {
  if (!enabled) {
    return null;
  }

  const unitAmount = Math.max(1000, Math.round(penaltyUnitAmount || 1000));
  const statusByPlayerId = new Map(statuses.map((status) => [status.playerId, status]));
  const penaltiesByPlayerId = new Map(
    penalties
      .filter((penalty) => penalty.holeId === hole.id)
      .map((penalty) => [penalty.playerId, penalty])
  );
  const targets = statuses.filter((status) => status.isTarget);

  function updatePenaltyAmount(playerId: string, amount: number) {
    const normalizedAmount = Math.max(0, Math.round(amount / unitAmount) * unitAmount);

    onChangePenalty({
      holeId: hole.id,
      holeNumber: hole.holeNumber,
      playerId,
      amount: normalizedAmount,
    });
  }

  return (
    <section className="rounded-2xl bg-rose-50 p-5 shadow-sm">
      <h2 className="text-lg font-bold text-rose-950">OECD 벌금 입력</h2>
      <p className="mt-1 text-sm text-rose-800">
        OECD 조건은 앱이 자동 판정하지 않습니다. 벌금은 기본 정액 {formatPlainAmount(unitAmount)}의 배수로 입력합니다.
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
            const currentMultiple = Math.round(currentPenalty / unitAmount);

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

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-9 w-9 rounded-full bg-rose-100 text-lg font-bold text-rose-800 disabled:bg-neutral-100 disabled:text-neutral-400"
                      disabled={!isTarget || currentPenalty <= 0}
                      onClick={() => updatePenaltyAmount(player.id, currentPenalty - unitAmount)}
                    >
                      -
                    </button>
                    <div className="w-28 rounded-xl border border-rose-200 bg-white px-3 py-2 text-right text-sm font-bold">
                      <p>{formatPlainAmount(currentPenalty)}</p>
                      <p className="text-xs font-medium text-neutral-500">{currentMultiple}배</p>
                    </div>
                    <button
                      type="button"
                      className="h-9 w-9 rounded-full bg-rose-700 text-lg font-bold text-white disabled:bg-neutral-100 disabled:text-neutral-400"
                      disabled={!isTarget}
                      onClick={() => updatePenaltyAmount(player.id, currentPenalty + unitAmount)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
