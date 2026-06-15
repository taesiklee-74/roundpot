#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
const latestPath = resolve(process.cwd(), "app/components/LatestResultSection.tsx");
let page = readFileSync(pagePath, "utf8");
let latest = readFileSync(latestPath, "utf8");
const originalPage = page;
const originalLatest = latest;
const applied = [];
const skipped = [];

function replaceInPage(label, search, replacement) {
  if (page.includes(replacement)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  if (!page.includes(search)) {
    skipped.push(`${label}: missing page anchor`);
    return;
  }

  page = page.replace(search, replacement);
  applied.push(label);
}

function replaceInLatest(label, search, replacement) {
  if (latest.includes(replacement)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  if (!latest.includes(search)) {
    skipped.push(`${label}: missing latest result anchor`);
    return;
  }

  latest = latest.replace(search, replacement);
  applied.push(label);
}

function insertAfterPage(label, search, insertion, alreadyText = insertion.trim()) {
  if (page.includes(alreadyText)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  const index = page.indexOf(search);
  if (index === -1) {
    skipped.push(`${label}: missing page anchor`);
    return;
  }

  page = page.slice(0, index + search.length) + insertion + page.slice(index + search.length);
  applied.push(label);
}

function insertAfterLatest(label, search, insertion, alreadyText = insertion.trim()) {
  if (latest.includes(alreadyText)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  const index = latest.indexOf(search);
  if (index === -1) {
    skipped.push(`${label}: missing latest result anchor`);
    return;
  }

  latest = latest.slice(0, index + search.length) + insertion + latest.slice(index + search.length);
  applied.push(label);
}

replaceInLatest(
  "LatestResultSection HoleOecdPenalty import",
  '  HoleGameResult,\n  Player,',
  '  HoleGameResult,\n  HoleOecdPenalty,\n  Player,'
);

replaceInLatest(
  "LatestResultSection extra props type",
  '  handicapAdjustments: HandicapScoreAdjustment[];\n  nearResult: NearResult | null;\n};',
  '  handicapAdjustments: HandicapScoreAdjustment[];\n  nearResult: NearResult | null;\n  oecdPenalties?: HoleOecdPenalty[];\n  latePrizeBoostExtraAmount?: number;\n};'
);

replaceInLatest(
  "LatestResultSection extra props destructure",
  '  handicapAdjustments,\n  nearResult,\n}: LatestResultSectionProps) {',
  '  handicapAdjustments,\n  nearResult,\n  oecdPenalties = [],\n  latePrizeBoostExtraAmount = 0,\n}: LatestResultSectionProps) {'
);

insertAfterLatest(
  "LatestResultSection latest near amount constant",
  '  const latestNearWinnerPlayerId = nearResult?.winnerPlayerId ?? null;',
  '\n  const latestNearAmount = nearResult?.amount ?? 0;',
  'const latestNearAmount = nearResult?.amount ?? 0;'
);

insertAfterLatest(
  "skins total received calculations",
  '          const titleText =\n            settings.mode === "cycle"\n              ? `${latestResult.holeNumber}번 홀 순환게임 · 스킨스`\n              : `${latestResult.holeNumber}번 홀 스킨스`;',
  '\n          const winnerPlayerIds = isWin ? latestResult.winnerPlayerIds : [];\n          const mainPrizeAmount = isWin ? latestResult.prizeAmount : 0;\n          const lateBoostAmount = isWin ? Math.max(0, latePrizeBoostExtraAmount) : 0;\n          const nearPrizeAmount =\n            isWin && latestNearWinnerPlayerId && winnerPlayerIds.includes(latestNearWinnerPlayerId)\n              ? latestNearAmount\n              : 0;\n          const oecdPenaltyAmount = isWin\n            ? oecdPenalties\n                .filter((penalty) => winnerPlayerIds.includes(penalty.playerId))\n                .reduce((sum, penalty) => sum + Math.max(0, penalty.amount), 0)\n            : 0;\n          const totalReceivedAmount =\n            mainPrizeAmount + lateBoostAmount + nearPrizeAmount - oecdPenaltyAmount;\n          const prizeBreakdownRows = [\n            mainPrizeAmount > 0\n              ? { label: "홀상금", amount: mainPrizeAmount, sign: 1 }\n              : null,\n            lateBoostAmount > 0\n              ? { label: "종반전 추가상금", amount: lateBoostAmount, sign: 1 }\n              : null,\n            nearPrizeAmount > 0\n              ? { label: "니어", amount: nearPrizeAmount, sign: 1 }\n              : null,\n            oecdPenaltyAmount > 0\n              ? { label: "OECD 벌금", amount: oecdPenaltyAmount, sign: -1 }\n              : null,\n          ].filter(\n            (row): row is { label: string; amount: number; sign: 1 | -1 } =>\n              row !== null\n          );',
  'const totalReceivedAmount ='
);

replaceInLatest(
  "skins prize card total and breakdown",
  '              <div\n                className={`mt-3 rounded-2xl p-4 ${isWin ? "bg-blue-50" : "bg-amber-50"}`}\n              >\n                <p\n                  className={`text-sm font-semibold ${isWin ? "text-blue-700" : "text-amber-700"}`}\n                >\n                  {isWin ? "수령 상금" : "이월 상금"}\n                </p>\n                <p\n                  className={`mt-1 text-3xl font-black ${isWin ? "text-blue-700" : "text-amber-700"}`}\n                >\n                  {formatPlainAmount(latestResult.prizeAmount)}\n                </p>\n              </div>',
  '              <div\n                className={`mt-3 rounded-2xl p-4 ${isWin ? "bg-blue-50" : "bg-amber-50"}`}\n              >\n                <p\n                  className={`text-sm font-semibold ${isWin ? "text-blue-700" : "text-amber-700"}`}\n                >\n                  {isWin ? "이번 홀 총 수령" : "이월 상금"}\n                </p>\n                <p\n                  className={`mt-1 text-3xl font-black ${isWin ? "text-blue-700" : "text-amber-700"}`}\n                >\n                  {formatPlainAmount(isWin ? totalReceivedAmount : latestResult.prizeAmount)}\n                </p>\n\n                {isWin && prizeBreakdownRows.length > 0 && (\n                  <div className="mt-3 space-y-1 border-t border-blue-100 pt-3 text-sm">\n                    {prizeBreakdownRows.map((row) => (\n                      <div key={row.label} className="flex items-center justify-between">\n                        <span className="text-neutral-600">{row.label}</span>\n                        <span className={row.sign > 0 ? "font-bold text-blue-700" : "font-bold text-rose-700"}>\n                          {row.sign > 0 ? "+" : "-"}\n                          {formatPlainAmount(row.amount)}\n                        </span>\n                      </div>\n                    ))}\n                  </div>\n                )}\n              </div>'
);

replaceInPage(
  "LatestResultSection pass OECD and late boost props",
  '              handicapAdjustments={latestHandicapAdjustments}\n              nearResult={latestNearResult}\n            />',
  '              handicapAdjustments={latestHandicapAdjustments}\n              nearResult={latestNearResult}\n              oecdPenalties={oecdPenalties.filter(\n                (penalty) => penalty.holeId === latestResult?.holeId\n              )}\n              latePrizeBoostExtraAmount={\n                latePrizeBoostDecision.allocations.find(\n                  (allocation) => allocation.holeId === latestResult?.holeId\n                )?.extraMainPrizeAmount ?? 0\n              }\n            />'
);

insertAfterPage(
  "late prize boost target hole memo",
  '  const currentOecdStatuses = useMemo<OecdPlayerStatus[]>(() => {\n    if (!currentHole) return [];\n\n    return calculateOecdStatusesForHole({\n      players,\n      holes,\n      currentHole,\n      cumulativeBeforeHoleByPlayer:\n        cumulativeBeforeHoleByNumber[currentHole.holeNumber] ?? {},\n      cumulativeBeforeHoleByNumber,\n      settings: settings.oecd,\n    });\n  }, [players, holes, currentHole, cumulativeBeforeHoleByNumber, settings.oecd]);',
  '\n\n  const latePrizeBoostTargetHole = useMemo(() => {\n    if (!currentHole) return null;\n\n    if (roundView === "latest-result") {\n      return (\n        holes.find((hole) => hole.holeNumber === currentHole.holeNumber + 1) ??\n        null\n      );\n    }\n\n    return currentHole;\n  }, [currentHole, holes, roundView]);',
  'const latePrizeBoostTargetHole = useMemo'
);

replaceInPage(
  "late prize offer uses target hole guard",
  '    if (!currentHole || !activeCalculation?.poolSummary) {\n      return null;\n    }',
  '    if (!latePrizeBoostTargetHole || !activeCalculation?.poolSummary) {\n      return null;\n    }'
);

replaceInPage(
  "late prize offer uses target remaining main",
  '      holes.filter((hole) => hole.holeNumber >= currentHole.holeNumber).length;',
  '      holes.filter((hole) => hole.holeNumber >= latePrizeBoostTargetHole.holeNumber).length;'
);

replaceInPage(
  "late prize offer uses target near current",
  '      currentHoleNumber: currentHole.holeNumber,',
  '      currentHoleNumber: latePrizeBoostTargetHole.holeNumber,'
);

replaceInPage(
  "late prize offer currentHole param target",
  '      currentHole,\n      settings,',
  '      currentHole: latePrizeBoostTargetHole,\n      settings,'
);

replaceInPage(
  "late prize offer deps target",
  '    currentHole,\n    activeCalculation,',
  '    latePrizeBoostTargetHole,\n    activeCalculation,'
);

replaceInPage(
  "late prize prompt visible on latest result too",
  '        offer={roundView === "play" ? latePrizeBoostOffer : null}',
  '        offer={roundView === "play" || roundView === "latest-result" ? latePrizeBoostOffer : null}'
);

if (page !== originalPage) {
  writeFileSync(pagePath, page, "utf8");
}
if (latest !== originalLatest) {
  writeFileSync(latestPath, latest, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
