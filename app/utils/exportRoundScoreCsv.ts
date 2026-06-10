export type ExportPlayer = {
  id: string;
  name: string;
};

export type ExportHoleScore = {
  holeNo: number;
  scores: Record<string, number | null | undefined>;
};

export type ExportRoundScoreInput = {
  roundTitle?: string;
  courseName?: string;
  playedAt?: string;
  players: ExportPlayer[];
  holes: ExportHoleScore[];
};

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export function buildRoundScoreCsv(input: ExportRoundScoreInput): string {
  const lines: string[] = [];

  lines.push(toCsvRow(["Roundpot Scorecard"]));

  if (input.roundTitle) {
    lines.push(toCsvRow(["라운드명", input.roundTitle]));
  }

  if (input.courseName) {
    lines.push(toCsvRow(["코스명", input.courseName]));
  }

  if (input.playedAt) {
    lines.push(toCsvRow(["날짜", input.playedAt]));
  }

  lines.push("");

  lines.push(toCsvRow(["Hole", ...input.players.map((player) => player.name)]));

  for (const hole of input.holes) {
    lines.push(
      toCsvRow([
        hole.holeNo,
        ...input.players.map((player) => hole.scores[player.id] ?? ""),
      ]),
    );
  }

  const totals = input.players.map((player) =>
    input.holes.reduce((sum, hole) => {
      const score = hole.scores[player.id];
      return typeof score === "number" ? sum + score : sum;
    }, 0),
  );

  lines.push(toCsvRow(["Total", ...totals]));

  return lines.join("\r\n");
}

export function downloadRoundScoreCsv(input: ExportRoundScoreInput): void {
  const csv = buildRoundScoreCsv(input);

  // UTF-8 BOM을 붙여야 Excel에서 한글이 깨지지 않습니다.
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const baseName =
    input.roundTitle ||
    input.courseName ||
    `roundpot-score-${new Date().toISOString().slice(0, 10)}`;

  const fileName = `${safeFileName(baseName)}.csv`;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}