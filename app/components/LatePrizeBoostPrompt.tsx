"use client";

import type { LatePrizeBoostOffer } from "../../src/lib/betting/latePrizeBoost";

type LatePrizeBoostPromptProps = {
  offer: LatePrizeBoostOffer | null;
  formatPlainAmount: (amount: number) => string;
  onAccept: () => void;
  onDecline: () => void;
};

export default function LatePrizeBoostPrompt({
  offer,
  formatPlainAmount,
  onAccept,
  onDecline,
}: LatePrizeBoostPromptProps) {
  if (!offer?.shouldOffer) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-4 py-6 sm:items-center sm:justify-center">
      <section className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
        <p className="text-sm font-bold text-blue-700">종반전 상금 증액 제안</p>
        <h2 className="mt-1 text-xl font-black text-neutral-950">
          잔여 상금이 많이 남아 있습니다
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {offer.holeNumber}번 홀부터 남은 홀의 메인 게임 상금에 추가 상금을 배정해
          잔여 상금을 줄일 수 있습니다. 니어 상금과 OECD 벌금 단위는 변경하지 않습니다.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-neutral-100 p-3">
            <p className="text-neutral-500">현재 총잔액</p>
            <p className="mt-1 font-black">{formatPlainAmount(offer.currentTotalBalance)}</p>
          </div>
          <div className="rounded-2xl bg-neutral-100 p-3">
            <p className="text-neutral-500">잔여 예상 지급액</p>
            <p className="mt-1 font-black">{formatPlainAmount(offer.remainingExpectedPayout)}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3">
            <p className="text-blue-700">초과분</p>
            <p className="mt-1 font-black text-blue-800">
              {formatPlainAmount(offer.excessAmount)}
            </p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-3">
            <p className="text-blue-700">기본 메인 상금</p>
            <p className="mt-1 font-black text-blue-800">
              {formatPlainAmount(offer.baseMainPrizeAmount)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
          <p className="text-sm font-bold">추가 상금 배정안</p>
          <div className="mt-2 space-y-1 text-sm">
            {offer.allocations.map((allocation) => (
              <div
                key={allocation.holeId}
                className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
              >
                <span>{allocation.holeNumber}번 홀</span>
                <span className="font-bold text-blue-700">
                  +{formatPlainAmount(allocation.extraMainPrizeAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-2xl bg-neutral-200 px-4 py-3 text-sm font-bold text-neutral-800"
            onClick={onDecline}
          >
            아니오
          </button>
          <button
            type="button"
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
            onClick={onAccept}
          >
            예, 상금 증액
          </button>
        </div>
      </section>
    </div>
  );
}
