"use client";

import type { Hole, Player } from "../../src/lib/betting/types";
import type { NearGameKind, NearResult } from "../../src/lib/betting/near";

type NearWinnerSelectorProps = {
  enabled: boolean;
  hole: Hole | null;
  gameKind: NearGameKind;
  amount: number;
  players: Player[];
  currentResult: NearResult | null;
  formatPlainAmount: (amount: number) => string;
  onChangeWinner: (winnerPlayerId: string | null) => void;
};

export default function NearWinnerSelector({
  enabled,
  hole,
  gameKind,
  amount,
  players,
  currentResult,
  formatPlainAmount,
  onChangeWinner,
}: NearWinnerSelectorProps) {
  const nearEligible = Boolean(enabled && hole?.par === 3);

  if (!nearEligible) {
    return null;
  }

  return (
    <div className="mt-4 rounded-2xl bg-lime-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-lime-700">파3 니어</p>
          <p className="mt-1 text-2xl font-black text-lime-900">
            {formatPlainAmount(amount)}
          </p>
          <p className="mt-1 text-xs text-lime-800">
            {gameKind === "vegas"
              ? `라스베가스 팀 니어: 위너가 속한 팀에 총 ${formatPlainAmount(
                  amount * 2
                )} 지급`
              : "개인 니어: 위너에게 보너스 지급"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-xl px-3 py-3 text-sm font-bold ${
            !currentResult?.winnerPlayerId
              ? "bg-lime-700 text-white"
              : "bg-white text-lime-900"
          }`}
          onClick={() => onChangeWinner(null)}
        >
          니어 없음
        </button>

        {players.map((player) => (
          <button
            type="button"
            key={player.id}
            className={`rounded-xl px-3 py-3 text-sm font-bold ${
              currentResult?.winnerPlayerId === player.id
                ? "bg-lime-700 text-white"
                : "bg-white text-lime-900"
            }`}
            onClick={() => onChangeWinner(player.id)}
          >
            {player.name}
          </button>
        ))}
      </div>
    </div>
  );
}