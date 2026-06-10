#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;

function replaceOnce(label, search, replacement) {
  if (source.includes(replacement)) {
    return;
  }

  if (!source.includes(search)) {
    console.warn(`Skip missing anchor: ${label}`);
    return;
  }

  source = source.replace(search, replacement);
}

function ensureScoreRowOecdStatus() {
  if (source.includes("const oecdStatus = currentOecdStatuses.find")) {
    return;
  }

  const needle =
    "                const scoreToPar = getDisplayScoreToPar(scores, currentHole, player.id);";
  const start = source.indexOf(needle);

  if (start === -1) {
    throw new Error("Cannot find score row scoreToPar anchor");
  }

  const returnAnchor = "\n\n                return (";
  const end = source.indexOf(returnAnchor, start);

  if (end === -1) {
    throw new Error("Cannot find score row return anchor");
  }

  const replacement = `${needle}\n                const oecdStatus = currentOecdStatuses.find(\n                  (status) => status.playerId === player.id\n                );`;

  source = source.slice(0, start) + replacement + source.slice(end);
}

ensureScoreRowOecdStatus();

replaceOnce(
  "remove actual strokes display",
  `                    <span className="font-medium">{player.name}</span>
                    <p className="text-xs text-neutral-500">실제 {strokes}타</p>`,
  `                    <span className="font-medium">{player.name}</span>
                    <p className="text-xs text-neutral-500">
                      {settings.oecd.enabled
                        ? getOecdStatusLabel(oecdStatus)
                        : "OECD 사용 안함"}
                    </p>`
);

replaceOnce(
  "oecd penalty section render",
  `          </div>

          {settings.mode === "vegas" &&`,
  `          </div>

          <OecdPenaltyInputSection
            enabled={settings.oecd.enabled}
            hole={currentHole}
            players={players}
            statuses={currentOecdStatuses}
            penalties={oecdPenalties}
            formatPlainAmount={formatPlainAmount}
            onChangePenalty={updateOecdPenalty}
          />

          {settings.mode === "vegas" &&`
);

replaceOnce(
  "medal rows oecd total",
  `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];
    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;
    const totalAmountWithNear = summary.totalPrizeAmount + nearTotalAmount;

    return {
      playerId: summary.playerId,
      playerName: summary.playerName,
      amount: totalAmountWithNear,
    };`,
  `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];
    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;
    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;
    const totalAmountWithNear =
      summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount;

    return {
      playerId: summary.playerId,
      playerName: summary.playerName,
      amount: totalAmountWithNear,
    };`
);

replaceOnce(
  "oecd settlement section",
  `  const strokeSettlementSection =
    settings.mode === "stroke" && settlementSummary.pairwiseSettlements.length > 0 ? (`,
  `  const oecdSettlementSection =
    settings.oecd.enabled &&
    (oecdSettlementSummary.totalPenaltyAmount > 0 ||
      oecdSettlementSummary.commonPotAmount > 0 ||
      oecdSettlementSummary.winnerPaidAmount > 0) ? (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">OECD 정산</h2>
        <p className="mt-1 text-sm text-neutral-500">
          수동 입력한 OECD 벌금이 총획득 상금에 반영됩니다.
        </p>

        <div className="mt-3 space-y-2">
          {oecdSettlementSummary.players
            .filter((summary) => summary.totalAmount !== 0)
            .map((summary) => (
              <div key={summary.playerId} className="rounded-xl bg-rose-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {getPlayerName(players, summary.playerId)}
                  </span>
                  <span className="font-bold text-rose-700">
                    {formatAmount(summary.totalAmount)}
                  </span>
                </div>

                {summary.breakdowns.length > 0 && (
                  <p className="mt-1 text-xs text-rose-800">
                    {summary.breakdowns.join(" · ")}
                  </p>
                )}
              </div>
            ))}
        </div>

        {oecdSettlementSummary.commonPotAmount > 0 && (
          <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">
            <p className="font-semibold">OECD 공통 pot</p>
            <p>{formatPlainAmount(oecdSettlementSummary.commonPotAmount)}</p>
          </div>
        )}
      </section>
    ) : null;

  const strokeSettlementSection =
    settings.mode === "stroke" && settlementSummary.pairwiseSettlements.length > 0 ? (`
);

replaceOnce(
  "show prize pool oecd",
  `    Boolean(activeCalculation.poolSummary) || nearSettlementSummary.totalPool > 0;`,
  `    Boolean(activeCalculation.poolSummary) ||
    nearSettlementSummary.totalPool > 0 ||
    oecdSettlementSummary.commonPotAmount > 0;`
);

replaceOnce(
  "prize pool oecd common pot",
  `      {nearSettlementSummary.totalPool > 0 && (
        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">`,
  `      {oecdSettlementSummary.commonPotAmount > 0 && (
        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">
          <p className="font-semibold">OECD 공통 pot</p>
          <p>OECD 누적 벌금: {formatPlainAmount(oecdSettlementSummary.commonPotAmount)}</p>
        </div>
      )}
      {nearSettlementSummary.totalPool > 0 && (
        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">`
);

replaceOnce(
  "latest result oecd section",
  `            {latestPrizeSection}            

            {isLastHole ? (`,
  `            {latestPrizeSection}
            {oecdSettlementSection}

            {isLastHole ? (`
);

replaceOnce(
  "settlement screen oecd section",
  `            {medalPrizeSection}
            {nearSettlementSection}
          </>`,
  `            {medalPrizeSection}
            {nearSettlementSection}
            {oecdSettlementSection}
          </>`
);

replaceOnce(
  "final screen oecd section",
  `            {medalPrizeSection}
            {nearSettlementSection}
            {strokeSettlementSection}`,
  `            {medalPrizeSection}
            {nearSettlementSection}
            {oecdSettlementSection}
            {strokeSettlementSection}`
);

if (source === original) {
  console.log("No changes needed. OECD continuation patch was already applied.");
} else {
  writeFileSync(pagePath, source, "utf8");
  console.log("Applied OECD continuation patch to app/page.tsx");
}
