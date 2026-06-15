#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
const latestPath = resolve(process.cwd(), "app/components/LatestResultSection.tsx");
let page = readFileSync(pagePath, "utf8");
let latest = readFileSync(latestPath, "utf8");
const beforePage = page;
const beforeLatest = latest;
const applied = [];
const skipped = [];

function patchPage(label, from, to) {
  if (page.includes(to)) {
    skipped.push(`${label}: already applied`);
    return;
  }
  if (!page.includes(from)) {
    skipped.push(`${label}: missing page anchor`);
    return;
  }
  page = page.replace(from, to);
  applied.push(label);
}

function patchLatest(label, from, to) {
  if (latest.includes(to)) {
    skipped.push(`${label}: already applied`);
    return;
  }
  if (!latest.includes(from)) {
    skipped.push(`${label}: missing latest anchor`);
    return;
  }
  latest = latest.replace(from, to);
  applied.push(label);
}

function insertPage(label, anchor, text, already) {
  if (page.includes(already ?? text.trim())) {
    skipped.push(`${label}: already applied`);
    return;
  }
  const i = page.indexOf(anchor);
  if (i === -1) {
    skipped.push(`${label}: missing page anchor`);
    return;
  }
  page = page.slice(0, i + anchor.length) + text + page.slice(i + anchor.length);
  applied.push(label);
}

function insertLatestBefore(label, anchor, text, already) {
  if (latest.includes(already ?? text.trim())) {
    skipped.push(`${label}: already applied`);
    return;
  }
  const i = latest.indexOf(anchor);
  if (i === -1) {
    skipped.push(`${label}: missing latest anchor`);
    return;
  }
  latest = latest.slice(0, i) + text + latest.slice(i);
  applied.push(label);
}

// Remove temporary debug panel.
const debugStart = page.indexOf(`        {hasStarted && (roundView === "play" || roundView === "latest-result") && latePrizeBoostTargetHole && latePrizeBoostTargetHole.holeNumber >= 16`);
if (debugStart !== -1) {
  const debugEndMarker = `        )}\n`;
  const debugEnd = page.indexOf(debugEndMarker, debugStart);
  if (debugEnd !== -1) {
    page = page.slice(0, debugStart) + page.slice(debugEnd + debugEndMarker.length);
    applied.push("remove late prize debug panel");
  } else {
    skipped.push("remove late prize debug panel: end anchor missing");
  }
} else {
  skipped.push("remove late prize debug panel: not found");
}

// Helper: positive OECD receipts only, for eligibility.
insertPage(
  "add OECD received-only totals helper",
  `function getOecdSettingsForSettlement(settings: BettingSettingsV2) {\n  return {\n    ...settings.oecd,\n    penaltyDestination:\n      settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot",\n  };\n}\n`,
  `\nfunction getOecdReceivedOnlyTotals(params: {\n  players: Player[];\n  penalties: HoleOecdPenalty[];\n  settings: BettingSettingsV2;\n  gameResult?: GameResult | null;\n}): Record<string, number> {\n  const { players, penalties, settings, gameResult = null } = params;\n  const totals = Object.fromEntries(players.map((player) => [player.id, 0]));\n  const effectiveDestination =\n    settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot";\n\n  if (!settings.oecd.enabled || effectiveDestination !== "winner") {\n    return totals;\n  }\n\n  for (const penalty of penalties) {\n    const amount = Math.max(0, penalty.amount);\n    if (amount <= 0) continue;\n\n    const holeResult = gameResult?.holeResults.find(\n      (result) => result.holeId === penalty.holeId\n    );\n    const winnerPlayerIds =\n      !holeResult || holeResult.winnerType === "none"\n        ? []\n        : holeResult.winnerPlayerIds;\n\n    if (winnerPlayerIds.length === 0) continue;\n\n    const baseShare = Math.floor(amount / winnerPlayerIds.length);\n    let remainder = amount - baseShare * winnerPlayerIds.length;\n\n    for (const winnerPlayerId of winnerPlayerIds) {\n      const share = baseShare + (remainder > 0 ? 1 : 0);\n      remainder = Math.max(0, remainder - 1);\n      totals[winnerPlayerId] = (totals[winnerPlayerId] ?? 0) + share;\n    }\n  }\n\n  return totals;\n}\n`,
  `function getOecdReceivedOnlyTotals`
);

insertPage(
  "calculate OECD received-only before hole",
  `  const oecdBeforeHole = calculateOecdSettlementSummary({\n    players: params.players,\n    penalties: params.oecdPenalties.filter(\n      (penalty) => penalty.holeNumber < params.targetHoleNumber\n    ),\n    settings: getOecdSettingsForSettlement(params.settings),\n    gameResult: calculationBeforeHole?.gameResult ?? null,\n  });`,
  `\n\n  const oecdReceivedBeforeHole = getOecdReceivedOnlyTotals({\n    players: params.players,\n    penalties: params.oecdPenalties.filter(\n      (penalty) => penalty.holeNumber < params.targetHoleNumber\n    ),\n    settings: params.settings,\n    gameResult: calculationBeforeHole?.gameResult ?? null,\n  });`,
  `const oecdReceivedBeforeHole = getOecdReceivedOnlyTotals`
);

patchPage(
  "OECD eligibility uses received-only positive OECD",
  `    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdTotal;`,
  `    const oecdReceivedTotal = oecdReceivedBeforeHole[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdReceivedTotal;`
);

// Return to final-share when round has no incomplete holes.
patchPage(
  "returnToPlay goes final after completion",
  `  if (firstIncompleteHoleIndex !== null) {\n    setCurrentHoleIndex(firstIncompleteHoleIndex);\n  }\n\n  setRoundView("play");`,
  `  if (firstIncompleteHoleIndex !== null) {\n    setCurrentHoleIndex(firstIncompleteHoleIndex);\n    setRoundView("play");\n    return;\n  }\n\n  setRoundView("final-share");`
);

// Latest result: move near card below result card.
latest = latest.replace(
  /\n\s*\{nearResult && latestNearWinnerPlayerId && \([\s\S]*?\n\s*\)\}\n\n\s*\{settings\.mode === "school" \? \(/,
  `\n\n      {settings.mode === "school" ? (`
);
if (latest !== beforeLatest) {
  applied.push("remove top near winner card");
} else {
  skipped.push("remove top near winner card: not found or already removed");
}

insertLatestBefore(
  "insert near winner below result card",
  `      {handicapAdjustments.length > 0 && (`,
  `      {nearResult && latestNearWinnerPlayerId && (\n        <div className="mt-4 rounded-2xl bg-lime-50 p-4">\n          <p className="text-sm font-bold text-lime-700">니어 위너</p>\n          <div className="mt-1 flex items-center justify-between gap-3">\n            <p className="text-xl font-black text-lime-950">\n              {getPlayerName(players, latestNearWinnerPlayerId)}\n            </p>\n            <p className="text-lg font-black text-lime-700">\n              {formatPlainAmount(nearResult.amount)}\n            </p>\n          </div>\n          <p className="mt-1 text-xs text-lime-800">\n            {nearResult.gameKind === "vegas"\n              ? "라스베가스 팀 니어 기준으로 정산됩니다."\n              : "파3 니어 보너스가 정산에 반영됩니다."}\n          </p>\n        </div>\n      )}\n\n`,
  `니어 위너`
);

// Latest result: OECD received row in skins breakdown.
patchLatest(
  "skins total includes OECD received",
  `          const oecdPenaltyAmount = isWin\n            ? oecdPenalties\n                .filter((penalty) => winnerPlayerIds.includes(penalty.playerId))\n                .reduce((sum, penalty) => sum + Math.max(0, penalty.amount), 0)\n            : 0;\n          const totalReceivedAmount =\n            mainPrizeAmount + lateBoostAmount + nearPrizeAmount - oecdPenaltyAmount;`,
  `          const oecdPenaltyAmount = isWin\n            ? oecdPenalties\n                .filter((penalty) => winnerPlayerIds.includes(penalty.playerId))\n                .reduce((sum, penalty) => sum + Math.max(0, penalty.amount), 0)\n            : 0;\n          const oecdReceivedAmount =\n            isWin &&\n            settings.mode === "skins" &&\n            settings.oecd.penaltyDestination === "winner" &&\n            winnerPlayerIds.length > 0\n              ? oecdPenalties.reduce((sum, penalty) => sum + Math.max(0, penalty.amount), 0)\n              : 0;\n          const totalReceivedAmount =\n            mainPrizeAmount +\n            lateBoostAmount +\n            nearPrizeAmount +\n            oecdReceivedAmount -\n            oecdPenaltyAmount;`
);

patchLatest(
  "skins breakdown shows OECD received",
  `            nearPrizeAmount > 0\n              ? { label: "니어", amount: nearPrizeAmount, sign: 1 }\n              : null,\n            oecdPenaltyAmount > 0`,
  `            nearPrizeAmount > 0\n              ? { label: "니어", amount: nearPrizeAmount, sign: 1 }\n              : null,\n            oecdReceivedAmount > 0\n              ? { label: "OECD 벌금 수령", amount: oecdReceivedAmount, sign: 1 }\n              : null,\n            oecdPenaltyAmount > 0`
);

if (page !== beforePage) writeFileSync(pagePath, page, "utf8");
if (latest !== beforeLatest) writeFileSync(latestPath, latest, "utf8");

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((x) => `  + ${x}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((x) => `  - ${x}`).join("\n"));
