"use client";

import type {
  BettingMode,
  BettingSettingsV2,
  HoleGameResult,
  Player,
} from "../../src/lib/betting/types";

import type { HandicapScoreAdjustment } from "../../src/lib/betting/handicap";
import type { NearResult } from "../../src/lib/betting/near";

type SchoolLatestResultDisplay = {
  firstPrizeAmount?: number;
  secondPrizeAmount?: number;
  firstPrizeWinnerPlayerIds?: string[];
  secondPrizeWinnerPlayerIds?: string[];
  firstPrizeTiedPlayerIds?: string[];
  secondPrizeTiedPlayerIds?: string[];
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

type LatestResultDisplay = HoleGameResult &
  Partial<
    SchoolLatestResultDisplay &
      VegasLatestResultDisplay &
      HusseinLatestResultDisplay &
      SkinsLatestResultDisplay
  >;

type LatestResultSectionProps = {
  latestResult: LatestResultDisplay | null;
  settings: BettingSettingsV2;
  players: Player[];
  formatTeam: (players: Player[], playerIds: string[]) => string;
  formatPlainAmount: (amount: number) => string;
  getPlayerName: (players: Player[], playerId: string) => string;
  handicapAdjustments: HandicapScoreAdjustment[];
  nearResult: NearResult | null;
};

function isSkinsDisplayResult(
  mode: BettingMode,
  result: LatestResultDisplay,
) {
  return mode === "skins" || result.innerGameType === "skins";
}

function isVegasDisplayResult(
  mode: BettingMode,
  result: LatestResultDisplay,
) {
  return mode === "vegas" || result.innerGameType === "vegas";
}

function isHusseinDisplayResult(
  mode: BettingMode,
  result: LatestResultDisplay,
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

function formatScoreToParForDisplay(scoreToPar: number): string {
  if (scoreToPar === 0) {
    return "0";
  }

  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

function formatPlayerNames(params: {
  players: Player[];
  playerIds: string[];
  getPlayerName: (players: Player[], playerId: string) => string;
}): string {
  const { players, playerIds, getPlayerName } = params;

  return playerIds
    .map((playerId) => getPlayerName(players, playerId))
    .join(", ");
}

export default function LatestResultSection({
  latestResult,
  settings,
  players,
  formatTeam,
  formatPlainAmount,
  getPlayerName,
  handicapAdjustments,
  nearResult,
}: LatestResultSectionProps) {
  if (!latestResult) {
    return null;
  }

  const latestNearWinnerPlayerId = nearResult?.winnerPlayerId ?? null;

  return (
    <section className="rounded-2xl bg-amber-50 p-5 shadow-sm">
      <h2 className="text-lg font-bold">방금 홀 결과</h2>

      {nearResult && latestNearWinnerPlayerId && (
        <div className="mt-3 rounded-2xl bg-lime-50 p-4">
          <p className="text-sm font-bold text-lime-700">니어 위너</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-xl font-black text-lime-950">
              {getPlayerName(players, latestNearWinnerPlayerId)}
            </p>
            <p className="text-lg font-black text-lime-700">
              {formatPlainAmount(nearResult.amount)}
            </p>
          </div>
          <p className="mt-1 text-xs text-lime-800">
            {nearResult.gameKind === "vegas"
              ? "라스베가스 팀 니어 기준으로 정산됩니다."
              : "파3 니어 보너스가 정산에 반영됩니다."}
          </p>
        </div>
      )}

      {settings.mode === "school" ? (
        (() => {
          const schoolResult = latestResult as typeof latestResult &
            SchoolLatestResultDisplay;
          const firstWinnerIds = schoolResult.firstPrizeWinnerPlayerIds ?? [];
          const secondWinnerIds = schoolResult.secondPrizeWinnerPlayerIds ?? [];
          const firstTiedIds = schoolResult.firstPrizeTiedPlayerIds ?? [];
          const secondTiedIds = schoolResult.secondPrizeTiedPlayerIds ?? [];
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
                    <div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="text-lg font-bold text-neutral-900">이월</p>
                        <p className="text-lg font-bold text-amber-600">
                          {firstCarriedOut.toLocaleString()}원
                        </p>
                      </div>
                      {firstTiedIds.length > 0 && (
                        <p className="mt-2 text-sm font-semibold text-amber-700">
                          동점 이월:{" "}
                          {formatPlayerNames({
                            players,
                            playerIds: firstTiedIds,
                            getPlayerName,
                          })}
                        </p>
                      )}
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
                    <div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="text-lg font-bold text-neutral-900">이월</p>
                        <p className="text-lg font-bold text-amber-600">
                          {secondCarriedOut.toLocaleString()}원
                        </p>
                      </div>
                      {secondTiedIds.length > 0 && (
                        <p className="mt-2 text-sm font-semibold text-amber-700">
                          동점 이월:{" "}
                          {formatPlayerNames({
                            players,
                            playerIds: secondTiedIds,
                            getPlayerName,
                          })}
                        </p>
                      )}
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
          const tiedPlayerIds =
            vegasResult.tiedPlayerIds ??
            (winnerTeamId ? [] : [...teamAPlayerIds, ...teamBPlayerIds]);
          const teamCards = [
            {
              id: "A" as const,
              label: "A팀",
              playerIds: teamAPlayerIds,
              score: teamAScore,
            },
            {
              id: "B" as const,
              label: "B팀",
              playerIds: teamBPlayerIds,
              score: teamBScore,
            },
          ];

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

              <div className="mt-4 grid grid-cols-1 gap-3">
                {teamCards.map((team) => {
                  const isWinner = winnerTeamId === team.id;

                  return (
                    <div
                      key={team.id}
                      className={`rounded-2xl border p-4 ${
                        isWinner
                          ? "border-blue-200 bg-blue-50"
                          : "border-neutral-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-black text-neutral-900">
                              {team.label}
                            </p>
                            {isWinner && (
                              <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">
                                승리
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-base font-bold leading-snug text-neutral-800">
                            {formatTeam(players, team.playerIds)}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-3xl font-black ${
                            isWinner ? "text-blue-700" : "text-neutral-900"
                          }`}
                        >
                          {team.score}타
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {winnerTeamId ? (
                <p className="mt-3 text-sm font-semibold text-blue-700">
                  수령: {formatTeam(players, winnerPlayerIds)} · 1인{" "}
                  {formatPlainAmount(latestResult.prizeAmount / 2)}
                </p>
              ) : (
                <div className="mt-3 text-sm font-semibold text-amber-700">
                  <p>
                    동점으로 {formatPlainAmount(latestResult.prizeAmount)} 이월
                  </p>
                  {tiedPlayerIds.length > 0 && (
                    <p className="mt-1">
                      동점 이월:{" "}
                      {formatPlayerNames({
                        players,
                        playerIds: tiedPlayerIds,
                        getPlayerName,
                      })}
                    </p>
                  )}
                </div>
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

          const explicitHusseinPlayerId = husseinResult.husseinPlayerId ?? "";

          const husseinPlayerId =
            explicitHusseinPlayerId ||
            (husseinResult.restPlayerIds?.length === 3
              ? (players.find(
                  (player) => !husseinResult.restPlayerIds?.includes(player.id),
                )?.id ?? "")
              : "");

          const restPlayerIds =
            husseinResult.restPlayerIds?.length === 3
              ? husseinResult.restPlayerIds
              : husseinPlayerId
                ? players
                    .filter((player) => player.id !== husseinPlayerId)
                    .map((player) => player.id)
                : [];

          const winnerType =
            husseinResult.husseinWinnerType ??
            (latestResult.winnerPlayerIds.length === 1
              ? "hussein"
              : latestResult.winnerPlayerIds.length > 1
                ? "rest"
                : "tie");
          const tiedPlayerIds =
            winnerType === "tie"
              ? husseinResult.tiedPlayerIds ?? [husseinPlayerId, ...restPlayerIds]
              : [];

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

                {winnerType === "tie" && tiedPlayerIds.length > 0 && (
                  <p className="mt-2 text-sm font-semibold text-amber-700">
                    동점 이월:{" "}
                    {formatPlayerNames({
                      players,
                      playerIds: tiedPlayerIds,
                      getPlayerName,
                    })}
                  </p>
                )}

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
            skinsResult.skinsPlayerIds ??
            latestResult.tiedPlayerIds ??
            latestResult.winnerPlayerIds;
          const isWin =
            skinsResult.skinsResultType === "win" ||
            latestResult.winnerPlayerIds.length === 1;
          const tiedPlayerIds = isWin
            ? []
            : skinsResult.tiedPlayerIds ?? skinsPlayerIds;
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

              {!isWin && tiedPlayerIds.length > 0 && (
                <p className="mt-3 text-sm font-semibold text-amber-700">
                  동점 이월:{" "}
                  {formatPlayerNames({
                    players,
                    playerIds: tiedPlayerIds,
                    getPlayerName,
                  })}
                </p>
              )}

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
          {latestResult.isCarryOver &&
            latestResult.tiedPlayerIds &&
            latestResult.tiedPlayerIds.length > 0 && (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                동점 이월:{" "}
                {formatPlayerNames({
                  players,
                  playerIds: latestResult.tiedPlayerIds,
                  getPlayerName,
                })}
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
    
      {handicapAdjustments.length > 0 && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-900">핸디 적용 내역</h3>
          <p className="mt-1 text-xs text-amber-800">
            스코어카드는 원 스코어 기준이며, 내기 계산에만 아래 핸디가 적용됩니다.
          </p>

          <div className="mt-3 space-y-2">
            {handicapAdjustments.map((adjustment) => (
              <div
                key={`${adjustment.holeId}-${adjustment.playerId}`}
                className="rounded-xl bg-white p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">
                    {getPlayerName(players, adjustment.playerId)}
                  </span>
                  <span className="font-bold text-amber-800">
                    {formatScoreToParForDisplay(adjustment.rawScoreToPar)} →{" "}
                    {formatScoreToParForDisplay(adjustment.adjustedScoreToPar)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-neutral-500">
                  원 스코어 {formatScoreToParForDisplay(adjustment.rawScoreToPar)}
                  에서 핸디 {adjustment.handicapStroke}타 차감
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
