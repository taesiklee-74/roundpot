"use client";

import type {
  BettingMode,
  BettingSettingsV2,
  Player,
} from "../../src/lib/betting/types";

type SchoolLatestResultDisplay = {
  firstPrizeAmount?: number;
  secondPrizeAmount?: number;
  firstPrizeWinnerPlayerIds?: string[];
  secondPrizeWinnerPlayerIds?: string[];
  firstPrizeCarriedIn?: number;
  secondPrizeCarriedIn?: number;
  firstPrizeCarriedOut?: number;
  secondPrizeCarriedOut?: number;
};

type VegasLatestResultDisplay = {
  innerGameType?: "skins" | "hussein" | "vegas";
  teamAPlayerIds?: string[];
  teamBPlayerIds?: string[];
  teamAScore?: number;
  teamBScore?: number;
  winnerTeamId?: "A" | "B" | null;
  assignmentReason?: string;
};

type HusseinLatestResultDisplay = {
  innerGameType?: "skins" | "hussein" | "vegas";
  husseinPlayerId?: string;
  husseinPlayerScore?: number;
  restPlayerIds?: string[];
  restBestScore?: number;
  restTotalScore?: number;
  husseinCompareScore?: number;
  restCompareScore?: number;
  husseinWinnerType?: "hussein" | "rest" | "tie";
};

type SkinsLatestResultDisplay = {
  innerGameType?: "skins" | "hussein" | "vegas";
  skinsPlayerIds?: string[];
  skinsScore?: number | null;
  skinsResultType?: "win" | "tie";
};

type LatestResultSectionProps = {
  latestResult: any | null;
  settings: BettingSettingsV2;
  players: Player[];
  formatTeam: (players: Player[], playerIds: string[]) => string;
  formatPlainAmount: (amount: number) => string;
  getPlayerName: (players: Player[], playerId: string) => string;
};

function isSkinsDisplayResult(
  mode: BettingMode,
  result: { gameType: string; title: string } & SkinsLatestResultDisplay,
) {
  return mode === "skins" || result.innerGameType === "skins";
}

function isVegasDisplayResult(
  mode: BettingMode,
  result: { gameType: string; title: string } & VegasLatestResultDisplay,
) {
  return mode === "vegas" || result.innerGameType === "vegas";
}

function isHusseinDisplayResult(
  mode: BettingMode,
  result: { gameType: string; title: string } & HusseinLatestResultDisplay,
) {
  return mode === "hussein" || result.innerGameType === "hussein";
}

function getSchoolCurrentLabel(params: {
  result: SchoolLatestResultDisplay;
  firstBaseAmount: number;
  secondBaseAmount: number;
}) {
  const { result, firstBaseAmount, secondBaseAmount } = params;

  const firstCarryCount =
    firstBaseAmount > 0
      ? Math.round((result.firstPrizeCarriedIn ?? 0) / firstBaseAmount)
      : 0;

  const secondCarryCount =
    secondBaseAmount > 0
      ? Math.round((result.secondPrizeCarriedIn ?? 0) / secondBaseAmount)
      : 0;

  return `${firstCarryCount + 1}학년 ${secondCarryCount + 1}반`;
}

export default function LatestResultSection({
  latestResult,
  settings,
  players,
  formatTeam,
  formatPlainAmount,
  getPlayerName,
}: LatestResultSectionProps) {
  if (!latestResult) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">방금 홀 결과</h2>

      {settings.mode === "school" ? (
        (() => {
          const schoolResult = latestResult as typeof latestResult &
            SchoolLatestResultDisplay;
          const firstWinnerIds = schoolResult.firstPrizeWinnerPlayerIds ?? [];
          const secondWinnerIds = schoolResult.secondPrizeWinnerPlayerIds ?? [];
          const firstPrizeAmount = schoolResult.firstPrizeAmount ?? 0;
          const secondPrizeAmount = schoolResult.secondPrizeAmount ?? 0;
          const firstCarriedOut = schoolResult.firstPrizeCarriedOut ?? 0;
          const secondCarriedOut = schoolResult.secondPrizeCarriedOut ?? 0;

          const paidAmount =
            (firstWinnerIds.length > 0 ? firstPrizeAmount : 0) +
            (secondWinnerIds.length > 0 ? secondPrizeAmount : 0);

          const carriedOutAmount = firstCarriedOut + secondCarriedOut;

          const schoolLabel = getSchoolCurrentLabel({
            result: schoolResult,
            firstBaseAmount: settings.school.firstPrizeAmount,
            secondBaseAmount: settings.school.secondPrizeAmount,
          });

          return (
            <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-bold">
                  {latestResult.holeNumber}번 홀 학교 · {schoolLabel}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-500">
                    1등 상금
                  </p>
                  {firstWinnerIds.length > 0 ? (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-lg font-bold text-neutral-900">
                        {formatTeam(players, firstWinnerIds)}
                      </p>
                      <p className="text-lg font-bold text-blue-600">
                        +{firstPrizeAmount.toLocaleString()}원
                      </p>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-lg font-bold text-neutral-900">이월</p>
                      <p className="text-lg font-bold text-amber-600">
                        {firstCarriedOut.toLocaleString()}원
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold text-neutral-500">
                    2등 상금
                  </p>
                  {secondWinnerIds.length > 0 ? (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-lg font-bold text-neutral-900">
                        {formatTeam(players, secondWinnerIds)}
                      </p>
                      <p className="text-lg font-bold text-blue-600">
                        +{secondPrizeAmount.toLocaleString()}원
                      </p>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-lg font-bold text-neutral-900">이월</p>
                      <p className="text-lg font-bold text-amber-600">
                        {secondCarriedOut.toLocaleString()}원
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {latestResult.detail && (
                <p className="mt-3 text-xs text-neutral-500">
                  {latestResult.detail}
                </p>
              )}

              <p className="mt-3 text-xs text-neutral-400">
                홀 총 상금 지출: {formatPlainAmount(paidAmount)}
                {carriedOutAmount > 0
                  ? ` · 이월: ${formatPlainAmount(carriedOutAmount)}`
                  : ""}
              </p>
            </div>
          );
        })()
      ) : isVegasDisplayResult(
          settings.mode,
          latestResult as typeof latestResult & VegasLatestResultDisplay,
        ) ? (
        (() => {
          const vegasResult = latestResult as typeof latestResult &
            VegasLatestResultDisplay;
          const teamAScore = vegasResult.teamAScore ?? 0;
          const teamBScore = vegasResult.teamBScore ?? 0;
          const teamAPlayerIds = vegasResult.teamAPlayerIds ?? [];
          const teamBPlayerIds = vegasResult.teamBPlayerIds ?? [];
          const winnerTeamId = vegasResult.winnerTeamId ?? null;

          const resultText =
            winnerTeamId === "A"
              ? "A팀 승리"
              : winnerTeamId === "B"
                ? "B팀 승리"
                : "동점";

          const winnerPlayerIds =
            winnerTeamId === "A"
              ? teamAPlayerIds
              : winnerTeamId === "B"
                ? teamBPlayerIds
                : [];

          return (
            <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-bold">
                  {latestResult.holeNumber}번 홀{" "}
                  {settings.mode === "cycle"
                    ? "순환게임 · 라스베가스"
                    : "라스베가스"}
                </p>
                <p
                  className={`text-xl font-black ${winnerTeamId ? "text-blue-600" : "text-amber-600"}`}
                >
                  {resultText}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div
                  className={`rounded-2xl p-4 ${winnerTeamId === "A" ? "bg-blue-50" : "bg-white"}`}
                >
                  <p className="text-sm font-semibold text-neutral-500">A팀</p>
                  <p className="mt-1 text-3xl font-black text-neutral-900">
                    {teamAScore}타
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    {formatTeam(players, teamAPlayerIds)}
                  </p>
                </div>
                <div
                  className={`rounded-2xl p-4 ${winnerTeamId === "B" ? "bg-blue-50" : "bg-white"}`}
                >
                  <p className="text-sm font-semibold text-neutral-500">B팀</p>
                  <p className="mt-1 text-3xl font-black text-neutral-900">
                    {teamBScore}타
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    {formatTeam(players, teamBPlayerIds)}
                  </p>
                </div>
              </div>

              {winnerTeamId ? (
                <p className="mt-3 text-sm font-semibold text-blue-700">
                  수령: {formatTeam(players, winnerPlayerIds)} · 1인{" "}
                  {formatPlainAmount(latestResult.prizeAmount / 2)}
                </p>
              ) : (
                <p className="mt-3 text-sm font-semibold text-amber-700">
                  동점으로 {formatPlainAmount(latestResult.prizeAmount)} 이월
                </p>
              )}

              {latestResult.detail && (
                <p className="mt-2 text-xs text-neutral-500">
                  {latestResult.detail}
                </p>
              )}
            </div>
          );
        })()
      ) : isHusseinDisplayResult(
          settings.mode,
          latestResult as typeof latestResult & HusseinLatestResultDisplay,
        ) ? (
        (() => {
          const husseinResult = latestResult as typeof latestResult &
            HusseinLatestResultDisplay;

          const husseinPlayerId =
            husseinResult.husseinPlayerId ??
            latestResult.winnerPlayerIds[0] ??
            "";
          const restPlayerIds =
            husseinResult.restPlayerIds ??
            players
              .filter((player) => player.id !== husseinPlayerId)
              .map((player) => player.id);

          const winnerType =
            husseinResult.husseinWinnerType ??
            (latestResult.winnerPlayerIds.length === 1
              ? "hussein"
              : latestResult.winnerPlayerIds.length > 1
                ? "rest"
                : "tie");

          const titleText =
            settings.mode === "cycle"
              ? `${latestResult.holeNumber}번 홀 순환게임 · 후세인`
              : `${latestResult.holeNumber}번 홀 후세인`;

          const resultText =
            winnerType === "hussein"
              ? "후세인 승리"
              : winnerType === "rest"
                ? "3명팀 승리"
                : "동점";

          const prizePerPlayer =
            winnerType === "rest" && latestResult.winnerPlayerIds.length > 0
              ? latestResult.prizeAmount / latestResult.winnerPlayerIds.length
              : latestResult.prizeAmount;

          return (
            <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-bold">{titleText}</p>
                <p
                  className={`text-xl font-black ${
                    winnerType === "tie" ? "text-amber-600" : "text-blue-600"
                  }`}
                >
                  {resultText}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div
                  className={`rounded-2xl p-4 ${
                    winnerType === "hussein" ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold text-neutral-500">
                    후세인
                  </p>
                  <p className="mt-1 text-2xl font-black text-neutral-900">
                    {getPlayerName(players, husseinPlayerId)}
                  </p>
                  {husseinResult.husseinPlayerScore !== undefined && (
                    <p className="mt-1 text-sm text-neutral-500">
                      {husseinResult.husseinPlayerScore}타
                    </p>
                  )}
                </div>

                <div
                  className={`rounded-2xl p-4 ${
                    winnerType === "rest" ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold text-neutral-500">
                    3명팀
                  </p>
                  <p className="mt-1 text-xl font-black text-neutral-900">
                    {formatTeam(players, restPlayerIds)}
                  </p>
                  {husseinResult.restBestScore !== undefined && (
                    <p className="mt-1 text-sm text-neutral-500">
                      베스트 {husseinResult.restBestScore}타
                      {husseinResult.restTotalScore !== undefined
                        ? ` · 합산 ${husseinResult.restTotalScore}타`
                        : ""}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`mt-3 rounded-2xl p-4 ${
                  winnerType === "tie" ? "bg-amber-50" : "bg-blue-50"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    winnerType === "tie" ? "text-amber-700" : "text-blue-700"
                  }`}
                >
                  {winnerType === "tie" ? "이월 상금" : "수령 상금"}
                </p>

                <p
                  className={`mt-1 text-3xl font-black ${
                    winnerType === "tie" ? "text-amber-700" : "text-blue-700"
                  }`}
                >
                  {formatPlainAmount(latestResult.prizeAmount)}
                </p>

                {winnerType !== "tie" && (
                  <p className="mt-2 text-sm font-semibold text-blue-700">
                    수령: {formatTeam(players, latestResult.winnerPlayerIds)}
                    {winnerType === "rest"
                      ? ` · 1인 ${formatPlainAmount(prizePerPlayer)}`
                      : ""}
                  </p>
                )}
              </div>

              {latestResult.carriedIn > 0 && (
                <p className="mt-3 text-xs text-blue-600">
                  이월 포함: {formatPlainAmount(latestResult.carriedIn)} + 기본{" "}
                  {formatPlainAmount(latestResult.baseAmount)}
                </p>
              )}

              {latestResult.detail && (
                <p className="mt-2 text-xs text-neutral-500">
                  {latestResult.detail}
                </p>
              )}
            </div>
          );
        })()
      ) : isSkinsDisplayResult(
          settings.mode,
          latestResult as typeof latestResult & SkinsLatestResultDisplay,
        ) ? (
        (() => {
          const skinsResult = latestResult as typeof latestResult &
            SkinsLatestResultDisplay;
          const skinsPlayerIds =
            skinsResult.skinsPlayerIds ?? latestResult.winnerPlayerIds;
          const isWin =
            skinsResult.skinsResultType === "win" ||
            latestResult.winnerPlayerIds.length === 1;
          const scoreText =
            skinsResult.skinsScore !== null &&
            skinsResult.skinsScore !== undefined
              ? `${skinsResult.skinsScore}타`
              : "최저타";
          const titleText =
            settings.mode === "cycle"
              ? `${latestResult.holeNumber}번 홀 순환게임 · 스킨스`
              : `${latestResult.holeNumber}번 홀 스킨스`;

          return (
            <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xl font-bold">{titleText}</p>
                <p
                  className={`text-xl font-black ${isWin ? "text-blue-600" : "text-amber-600"}`}
                >
                  {isWin ? "승리" : "동점"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-neutral-500">
                  {isWin ? "승자" : "동점자"}
                </p>
                <p className="mt-1 text-2xl font-black text-neutral-900">
                  {formatTeam(players, skinsPlayerIds)}
                </p>
                <p className="mt-1 text-sm text-neutral-500">{scoreText}</p>
              </div>

              <div
                className={`mt-3 rounded-2xl p-4 ${isWin ? "bg-blue-50" : "bg-amber-50"}`}
              >
                <p
                  className={`text-sm font-semibold ${isWin ? "text-blue-700" : "text-amber-700"}`}
                >
                  {isWin ? "수령 상금" : "이월 상금"}
                </p>
                <p
                  className={`mt-1 text-3xl font-black ${isWin ? "text-blue-700" : "text-amber-700"}`}
                >
                  {formatPlainAmount(latestResult.prizeAmount)}
                </p>
              </div>

              {latestResult.carriedIn > 0 && (
                <p className="mt-3 text-xs text-blue-600">
                  이월 포함: {formatPlainAmount(latestResult.carriedIn)} + 기본{" "}
                  {formatPlainAmount(latestResult.baseAmount)}
                </p>
              )}

              {latestResult.detail && (
                <p className="mt-2 text-xs text-neutral-500">
                  {latestResult.detail}
                </p>
              )}
            </div>
          );
        })()
      ) : (
        <div className="mt-3 rounded-2xl bg-neutral-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{latestResult.title}</p>
            {latestResult.prizeAmount > 0 && (
              <p className="font-bold">
                {latestResult.isCarryOver
                  ? `${latestResult.prizeAmount.toLocaleString()}원 이월`
                  : `+${latestResult.prizeAmount.toLocaleString()}원`}
              </p>
            )}
          </div>
          <p className="mt-2 text-sm text-neutral-700">
            {latestResult.description}
          </p>
          {latestResult.detail && (
            <p className="mt-1 text-xs text-neutral-500">
              {latestResult.detail}
            </p>
          )}
          {latestResult.winnerPlayerIds.length > 0 &&
            latestResult.prizeAmount > 0 && (
              <p className="mt-2 text-sm font-semibold text-blue-700">
                수령: {formatTeam(players, latestResult.winnerPlayerIds)} · 총{" "}
                {formatPlainAmount(latestResult.prizeAmount)}
              </p>
            )}
        </div>
      )}
    </section>
  );
}
