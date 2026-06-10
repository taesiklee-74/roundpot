"use client";

type PrizeAmountRankingRow = {
  playerId: string;
  playerName: string;
  amount: number;
};

type PrizeAmountRankingCardProps = {
  title: string;
  description?: string;
  rows: PrizeAmountRankingRow[];
};

function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function rankRows(rows: PrizeAmountRankingRow[]) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);

  let previousAmount: number | null = null;
  let previousRank = 0;

  const rankedRows = sorted.map((row, index) => {
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

  const rankCounts = rankedRows.reduce<Record<number, number>>((acc, row) => {
    acc[row.rank] = (acc[row.rank] ?? 0) + 1;
    return acc;
  }, {});

  return rankedRows.map((row) => ({
    ...row,
    rankLabel:
      rankCounts[row.rank] > 1 ? `공동 ${row.rank}위` : `${row.rank}위`,
  }));
}

export default function PrizeAmountRankingCard({
  title,
  description,
  rows,
}: PrizeAmountRankingCardProps) {
  const rankedRows = rankRows(rows);

  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-extrabold text-neutral-900">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-neutral-500">{description}</p>
        )}
      </div>

      <div className="space-y-2">
        {rankedRows.map((row) => (
          <div
            key={row.playerId}
            className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3"
          >
            <div>
              <div className="text-xs font-bold text-neutral-500">
                {row.rankLabel}
              </div>
              <div className="mt-0.5 text-base font-extrabold text-neutral-900">
                {row.playerName}
              </div>
            </div>

            <div className="text-right text-base font-extrabold text-blue-600">
              {formatWon(row.amount)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}