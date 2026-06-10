"use client";

type MedalPrizeRow = {
  playerId: string;
  playerName: string;
  amount: number;
};

type MedalPrizeSummaryCardProps = {
  rows: MedalPrizeRow[];
};

function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function getMedal(rank: number): {
  image: string;
  label: string;
  bgClass: string;
} {
  if (rank === 1) {
    return {
      image: "🥇",
      label: "금메달",
      bgClass: "bg-yellow-50 border-yellow-200",
    };
  }

  if (rank === 2) {
    return {
      image: "🥈",
      label: "은메달",
      bgClass: "bg-neutral-50 border-neutral-200",
    };
  }

  if (rank === 3) {
    return {
      image: "🥉",
      label: "동메달",
      bgClass: "bg-orange-50 border-orange-200",
    };
  }

  return {
    image: "🎗️",
    label: "노메달",
    bgClass: "bg-slate-50 border-slate-200",
  };
}

function rankPrizeRows(rows: MedalPrizeRow[]) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);

  let previousAmount: number | null = null;
  let previousRank = 0;

  return sorted.map((row, index) => {
    const rank =
      previousAmount !== null && row.amount === previousAmount
        ? previousRank
        : index + 1;

    previousAmount = row.amount;
    previousRank = rank;

    return {
      ...row,
      rank,
    };
  });
}

export default function MedalPrizeSummaryCard({
  rows,
}: MedalPrizeSummaryCardProps) {
  const rankedRows = rankPrizeRows(rows);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-neutral-900">
            시상 결과
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            동률은 같은 메달로 표시하고 다음 순위는 건너뜁니다.
          </p>
        </div>

        <div className="text-3xl" aria-hidden="true">
          🏆
        </div>
      </div>

      <div className="grid gap-3">
        {rankedRows.map((row) => {
          const medal = getMedal(row.rank);

          return (
            <div
              key={row.playerId}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${medal.bgClass}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm"
                  aria-hidden="true"
                >
                  {medal.image}
                </div>

                <div>
                  <div className="text-sm font-bold text-neutral-500">
                    {row.rank}위 · {medal.label}
                  </div>
                  <div className="text-base font-extrabold text-neutral-900">
                    {row.playerName}
                  </div>
                </div>
              </div>

              <div className="text-right text-base font-extrabold text-neutral-900">
                {formatWon(row.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}