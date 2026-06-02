"use client";

import { useState } from "react";

type RoundShareCardProps = {
  summaryText: string;
};

export default function RoundShareCard({ summaryText }: RoundShareCardProps) {
  const [copied, setCopied] = useState(false);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setCopied(false);
      alert("복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">정산 공유</h2>
      <p className="mt-1 text-sm text-neutral-500">
        카톡 공유용 정산 내용을 복사해서 채팅방에 붙여넣을 수 있습니다.
      </p>

      <button
        type="button"
        onClick={copySummary}
        className="mt-4 w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white"
      >
        {copied ? "복사되었습니다" : "카톡 공유용 정산 복사"}
      </button>

      <details className="mt-3 rounded-2xl bg-neutral-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-700">
          공유 내용 미리보기
        </summary>
        <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-neutral-600">
          {summaryText}
        </pre>
      </details>
    </section>
  );
}