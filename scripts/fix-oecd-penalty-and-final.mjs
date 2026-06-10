#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;
const applied = [];
const skipped = [];

function logApply(label) {
  applied.push(label);
}

function logSkip(label, reason) {
  skipped.push(`${label}: ${reason}`);
}

function removeExistingPenaltySections() {
  const pattern = /\n\s*<OecdPenaltyInputSection\n[\s\S]*?\n\s*\/>(\n)?/g;
  let count = 0;
  source = source.replace(pattern, () => {
    count += 1;
    return "\n";
  });

  if (count > 0) {
    logApply(`removed ${count} existing OECD penalty section(s)`);
  } else {
    logSkip("remove existing OECD penalty sections", "none found");
  }
}

function findSelfClosingComponentEnd(startIndex) {
  const endIndex = source.indexOf("\n          />", startIndex);
  if (endIndex !== -1) {
    return endIndex + "\n          />".length;
  }

  const compactEndIndex = source.indexOf("/>", startIndex);
  if (compactEndIndex !== -1) {
    return compactEndIndex + 2;
  }

  return -1;
}

function insertPenaltySectionAfterNearWinner() {
  if (source.includes("<OecdPenaltyInputSection")) {
    logSkip("insert OECD penalty section", "already present");
    return;
  }

  const nearIndex = source.indexOf("<NearWinnerSelector");
  if (nearIndex === -1) {
    logSkip("insert OECD penalty section", "NearWinnerSelector not found");
    return;
  }

  const insertAt = findSelfClosingComponentEnd(nearIndex);
  if (insertAt === -1) {
    logSkip("insert OECD penalty section", "NearWinnerSelector closing not found");
    return;
  }

  const block = `\n\n          <OecdPenaltyInputSection\n            enabled={settings.oecd.enabled}\n            hole={currentHole}\n            players={players}\n            statuses={currentOecdStatuses}\n            penalties={oecdPenalties}\n            formatPlainAmount={formatPlainAmount}\n            onChangePenalty={updateOecdPenalty}\n          />`;

  source = source.slice(0, insertAt) + block + source.slice(insertAt);
  logApply("inserted OECD penalty section after NearWinnerSelector");
}

function ensureAllNearSettlementSectionsIncludeOecd() {
  let count = 0;
  source = source.replace(
    /(\n\s*\{nearSettlementSection\})(?!\s*\n\s*\{oecdSettlementSection\})/g,
    (match) => {
      count += 1;
      const indent = match.match(/\n(\s*)\{nearSettlementSection\}/)?.[1] ?? "";
      return `${match}\n${indent}{oecdSettlementSection}`;
    }
  );

  if (count > 0) {
    logApply(`added OECD settlement section after near settlement in ${count} place(s)`);
  } else {
    logSkip("add OECD settlement after near settlement", "already present or no anchors");
  }
}

function ensureLatestPrizeIncludesOecd() {
  let count = 0;
  source = source.replace(
    /(\n\s*\{latestPrizeSection\})(?!\s*\n\s*\{oecdSettlementSection\})/g,
    (match) => {
      count += 1;
      const indent = match.match(/\n(\s*)\{latestPrizeSection\}/)?.[1] ?? "";
      return `${match}\n${indent}{oecdSettlementSection}`;
    }
  );

  if (count > 0) {
    logApply(`added OECD settlement section after latest prize in ${count} place(s)`);
  } else {
    logSkip("add OECD settlement after latest prize", "already present or no anchors");
  }
}

function ensureMedalRowsUseOecd() {
  if (source.includes("const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0")) {
    logSkip("medal rows include OECD", "already present");
    return;
  }

  const before = `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];
    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;
    const totalAmountWithNear = summary.totalPrizeAmount + nearTotalAmount;

    return {
      playerId: summary.playerId,
      playerName: summary.playerName,
      amount: totalAmountWithNear,
    };`;

  const after = `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];
    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;
    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;
    const totalAmountWithNear =
      summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount;

    return {
      playerId: summary.playerId,
      playerName: summary.playerName,
      amount: totalAmountWithNear,
    };`;

  if (!source.includes(before)) {
    logSkip("medal rows include OECD", "anchor not found");
    return;
  }

  source = source.replace(before, after);
  logApply("medal rows include OECD");
}

function ensureOecdSettlementSectionExists() {
  if (source.includes("const oecdSettlementSection =")) {
    logSkip("OECD settlement section constant", "already present");
    return;
  }

  const anchor = "  const strokeSettlementSection =";
  const index = source.indexOf(anchor);
  if (index === -1) {
    logSkip("OECD settlement section constant", "stroke settlement anchor not found");
    return;
  }

  const block = `  const oecdSettlementSection =
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
                  <span className="font-medium">{getPlayerName(players, summary.playerId)}</span>
                  <span className="font-bold text-rose-700">{formatAmount(summary.totalAmount)}</span>
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

`;

  source = source.slice(0, index) + block + source.slice(index);
  logApply("OECD settlement section constant");
}

removeExistingPenaltySections();
insertPenaltySectionAfterNearWinner();
ensureOecdSettlementSectionExists();
ensureMedalRowsUseOecd();
ensureLatestPrizeIncludesOecd();
ensureAllNearSettlementSectionsIncludeOecd();

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} fix step(s).`);
if (applied.length > 0) {
  console.log(applied.map((item) => `  + ${item}`).join("\n"));
}
console.log(`Skipped ${skipped.length} step(s).`);
if (skipped.length > 0) {
  console.log(skipped.map((item) => `  - ${item}`).join("\n"));
}
