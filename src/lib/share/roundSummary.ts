type RoundSummaryPlayer = {
  playerId: string;
  playerName: string;
  totalAmount: number;
};

type RoundSummaryNearPlayer = {
  playerId: string;
  playerName: string;
  totalAmount: number;
  breakdowns: string[];
};

type BuildRoundSummaryTextParams = {
  appName?: string;
  courseName: string;
  gameModeLabel: string;
  holeCount: 9 | 18;
  players: RoundSummaryPlayer[];
  nearPlayers?: RoundSummaryNearPlayer[];
};

function formatSignedAmount(amount: number): string {
  const absAmount = Math.abs(amount).toLocaleString("ko-KR");

  if (amount > 0) {
    return `+${absAmount}원`;
  }

  if (amount < 0) {
    return `-${absAmount}원`;
  }

  return "0원";
}

export function buildRoundSummaryText({
  appName = "Roundpot",
  courseName,
  gameModeLabel,
  holeCount,
  players,
  nearPlayers = [],
}: BuildRoundSummaryTextParams): string {
  const sortedPlayers = [...players].sort(
    (a, b) => b.totalAmount - a.totalAmount
  );

  const lines: string[] = [
    `⛳ ${appName} 오늘의 정산`,
    "",
    `게임: ${gameModeLabel}`,
    `코스: ${courseName || "미입력"}`,
    `홀: ${holeCount}홀`,
    "",
    "💰 최종 정산",
  ];

  sortedPlayers.forEach((player) => {
    lines.push(`${player.playerName} ${formatSignedAmount(player.totalAmount)}`);
  });

  const activeNearPlayers = nearPlayers.filter(
    (player) => player.totalAmount !== 0
  );

  if (activeNearPlayers.length > 0) {
    lines.push("", "🎯 니어 정산");

    activeNearPlayers.forEach((player) => {
      lines.push(
        `${player.playerName} ${formatSignedAmount(player.totalAmount)}`
      );

      if (player.breakdowns.length > 0) {
        lines.push(`- ${player.breakdowns.join(" · ")}`);
      }
    });
  }

  lines.push("", "Roundpot으로 계산");

  return lines.join("\n");
}