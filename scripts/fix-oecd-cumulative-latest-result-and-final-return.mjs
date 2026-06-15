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

// Remove temporary late-prize debug panel.
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

// OECD eligibility should use current holdings, not only positive OECD receipts.
// If an earlier local run inserted the received-only helper, remove it and restore the net OECD total.
const receivedHelperPattern = /\nfunction getOecdReceivedOnlyTotals\(params: \{[\s\S]*?\n\}\n\nfunction getCumulativePrizeTotalsBeforeHole/;
if (receivedHelperPattern.test(page)) {
  page = page.replace(receivedHelperPattern, "\nfunction getCumulativePrizeTotalsBeforeHole");
  applied.push("remove received-only OECD helper");
} else {
  skipped.push("remove received-only OECD helper: not found");
}

const receivedBeforePattern = /\n\n  const oecdReceivedBeforeHole = getOecdReceivedOnlyTotals\(\{[\s\S]*?\n  \}\);/;
if (receivedBeforePattern.test(page)) {
  page = page.replace(receivedBeforePattern, "");
  applied.push("remove received-only OECD before-hole calculation");
} else {
  skipped.push("remove received-only OECD before-hole calculation: not found");
}

patchPage(
  "restore OECD eligibility to current holdings",
  `    const oecdReceivedTotal = oecdReceivedBeforeHole[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdReceivedTotal;`,
  `    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdTotal;`
);

// Return to final-share when round has no incomplete holes.
patchPage(
  "returnToPlay goes final after completion",
  `  if (firstIncompleteHoleIndex !== null) {\n    setCurrentHoleIndex(firstIncompleteHoleIndex);\n  }\n\n  setRoundView("play");`,
  `  if (firstIncompleteHoleIndex !== null) {\n    setCurrentHoleIndex(firstIncompleteHoleIndex);\n    setRoundView("play");\n    return;\n  }\n\n  setRoundView("final-share");`
);

// Latest result: move near card below the main result card.
const latestBeforeNearMove = latest;
latest = latest.replace(
  /\n\s*\{nearResult && latestNearWinnerPlayerId && \([\s\S]*?\n\s*\)\}\n\n\s*\{settings\.mode === "school" \? \(/,
  `\n\n      {settings.mode === "school" ? (`
);
if (latest !== latestBeforeNearMove) {
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
