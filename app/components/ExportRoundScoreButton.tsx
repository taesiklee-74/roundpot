"use client";

import {
  downloadRoundScoreCsv,
  type ExportHoleScore,
  type ExportPlayer,
} from "../utils/exportRoundScoreCsv";

type ExportRoundScoreButtonProps = {
  roundTitle?: string;
  courseName?: string;
  playedAt?: string;
  players: ExportPlayer[];
  holes: ExportHoleScore[];
};

export default function ExportRoundScoreButton({
  roundTitle,
  courseName,
  playedAt,
  players,
  holes,
}: ExportRoundScoreButtonProps) {
  const canExport = players.length > 0 && holes.length > 0;

  return (
    <button
      type="button"
      onClick={() =>
        downloadRoundScoreCsv({
          roundTitle,
          courseName,
          playedAt,
          players,
          holes,
        })
      }
      disabled={!canExport}
      className="w-full rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-base font-bold text-neutral-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
    >
      스코어 Excel 다운로드
    </button>
  );
}