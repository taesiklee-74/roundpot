#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;
const applied = [];
const skipped = [];

function insertAfter(label, search, insertion, alreadyText = insertion.trim()) {
  if (source.includes(alreadyText)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  const index = source.indexOf(search);
  if (index === -1) {
    skipped.push(`${label}: missing anchor`);
    return;
  }

  source = source.slice(0, index + search.length) + insertion + source.slice(index + search.length);
  applied.push(label);
}

function insertBefore(label, search, insertion, alreadyText = insertion.trim()) {
  if (source.includes(alreadyText)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  const index = source.indexOf(search);
  if (index === -1) {
    skipped.push(`${label}: missing anchor`);
    return;
  }

  source = source.slice(0, index) + insertion + source.slice(index);
  applied.push(label);
}

function replaceExact(label, search, replacement) {
  if (source.includes(replacement)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  if (!source.includes(search)) {
    skipped.push(`${label}: missing exact anchor`);
    return;
  }

  source = source.replace(search, replacement);
  applied.push(label);
}

function replaceRegex(label, pattern, replacement, alreadyText) {
  if (alreadyText && source.includes(alreadyText)) {
    skipped.push(`${label}: already applied`);
    return;
  }

  if (!pattern.test(source)) {
    skipped.push(`${label}: missing regex anchor`);
    return;
  }

  source = source.replace(pattern, replacement);
  applied.push(label);
}

// 1) Explicit OECD common pot calculation for balance, including winner-mode penalties with no winner.
insertAfter(
  "explicit OECD common pot for balance",
  `  const oecdSettlementSummary = useMemo(\n    () =>\n      calculateOecdSettlementSummary({\n        players,\n        penalties: oecdPenalties,\n        settings: getOecdSettingsForSettlement(settings),\n        gameResult: activeCalculation?.gameResult ?? null,\n      }),\n    [players, oecdPenalties, settings, activeCalculation]\n  );`,
  `\n\n  const oecdCommonPotForBalance = useMemo(() => {\n    if (!settings.oecd.enabled) {\n      return 0;\n    }\n\n    const effectiveDestination =\n      settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot";\n    const holeResultById = new Map(\n      (activeCalculation?.gameResult.holeResults ?? []).map((result) => [\n        result.holeId,\n        result,\n      ])\n    );\n\n    return oecdPenalties.reduce((sum, penalty) => {\n      const amount = Math.max(0, penalty.amount);\n      if (amount <= 0) return sum;\n\n      if (effectiveDestination === "commonPot") {\n        return sum + amount;\n      }\n\n      const holeResult = holeResultById.get(penalty.holeId);\n      if (\n        !holeResult ||\n        holeResult.winnerType === "none" ||\n        holeResult.winnerPlayerIds.length === 0\n      ) {\n        return sum + amount;\n      }\n\n      return sum;\n    }, 0);\n  }, [\n    settings.oecd.enabled,\n    settings.oecd.penaltyDestination,\n    settings.mode,\n    oecdPenalties,\n    activeCalculation,\n  ]);`,
  `const oecdCommonPotForBalance = useMemo`
);

// 2) Late prize boost offer balance should use the exact pool formula.
replaceRegex(
  "late prize boost current balance formula",
  /    const currentMainBalance = Math\.max\(\n      0,\n      activeCalculation\.poolSummary\.totalPool - activeCalculation\.poolSummary\.poolPaid\n    \);\n    const currentTotalBalance =\n      currentMainBalance \+\n      nearSettlementSummary\.remainingPool \+\n      oecdSettlementSummary\.commonPotAmount;/,
  `    const latePrizeBoostPaidAmount = Math.max(\n      0,\n      latePrizeBoostSettlementSummary.totalExtraPrizeAmount -\n        latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount\n    );\n    const currentTotalPrizeAmount =\n      activeCalculation.poolSummary.totalPool + nearSettlementSummary.totalPool;\n    const currentPaidPrizeAmount =\n      activeCalculation.poolSummary.poolPaid +\n      nearSettlementSummary.paidAmount +\n      latePrizeBoostPaidAmount;\n    const currentTotalBalance = Math.max(\n      0,\n      currentTotalPrizeAmount + oecdCommonPotForBalance - currentPaidPrizeAmount\n    );`,
  `currentTotalPrizeAmount + oecdCommonPotForBalance - currentPaidPrizeAmount`
);

replaceExact(
  "late prize boost deps include OECD balance and paid boost",
  `    nearSettlementSummary.remainingPool,\n    oecdSettlementSummary.commonPotAmount,\n    latePrizeBoostDecision,`,
  `    nearSettlementSummary.totalPool,\n    nearSettlementSummary.paidAmount,\n    oecdCommonPotForBalance,\n    latePrizeBoostDecision,\n    latePrizeBoostSettlementSummary.totalExtraPrizeAmount,\n    latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount,`
);

// 3) Prize pool visibility uses explicit OECD common pot.
replaceExact(
  "showPrizePool uses explicit OECD common pot",
  `    nearSettlementSummary.totalPool > 0 ||\n    oecdSettlementSummary.commonPotAmount > 0 ||\n    latePrizeBoostSettlementSummary.totalExtraPrizeAmount > 0;`,
  `    nearSettlementSummary.totalPool > 0 ||\n    oecdCommonPotForBalance > 0 ||\n    latePrizeBoostSettlementSummary.totalExtraPrizeAmount > 0;`
);

replaceExact(
  "legacy showPrizePool uses explicit OECD common pot",
  `    nearSettlementSummary.totalPool > 0 ||\n    oecdSettlementSummary.commonPotAmount > 0;`,
  `    nearSettlementSummary.totalPool > 0 ||\n    oecdCommonPotForBalance > 0;`
);

// 4) Pool balance display constants.
insertBefore(
  "pool balance display constants",
  `  const prizePoolSection = showPrizePool ? (`,
  `  const poolMainTotalPrizeAmount = activeCalculation.poolSummary?.totalPool ?? 0;\n  const poolNearTotalPrizeAmount = nearSettlementSummary.totalPool;\n  const poolTotalPrizeAmount = poolMainTotalPrizeAmount + poolNearTotalPrizeAmount;\n  const poolLatePrizeBoostPaidAmount = Math.max(\n    0,\n    latePrizeBoostSettlementSummary.totalExtraPrizeAmount -\n      latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount\n  );\n  const poolMainPaidPrizeAmount =\n    (activeCalculation.poolSummary?.poolPaid ?? 0) + poolLatePrizeBoostPaidAmount;\n  const poolNearPaidPrizeAmount = nearSettlementSummary.paidAmount;\n  const poolPaidPrizeAmount = poolMainPaidPrizeAmount + poolNearPaidPrizeAmount;\n  const poolRemainingPrizeAmount = Math.max(\n    0,\n    poolTotalPrizeAmount + oecdCommonPotForBalance - poolPaidPrizeAmount\n  );\n\n`,
  `const poolTotalPrizeAmount = poolMainTotalPrizeAmount + poolNearTotalPrizeAmount;`
);

// 5) Replace whole prize pool section with the new clearer formula display.
replaceRegex(
  "replace prize pool section display",
  /  const prizePoolSection = showPrizePool \? \([\s\S]*?\n  \) : null;\n\n  return \(/,
  `  const prizePoolSection = showPrizePool ? (\n    <section className="rounded-2xl bg-neutral-900 p-5 text-white shadow-sm">\n      <h2 className="text-lg font-bold">상금 풀</h2>\n      <div className="mt-3 grid grid-cols-1 gap-2 text-sm">\n        <div className="rounded-xl bg-white/15 p-3">\n          <p className="opacity-80">총상금</p>\n          <p className="text-lg font-bold">{formatPlainAmount(poolTotalPrizeAmount)}</p>\n          <p className="mt-1 text-xs opacity-75">\n            홀상금 {formatPlainAmount(poolMainTotalPrizeAmount)} + 니어상금 {formatPlainAmount(poolNearTotalPrizeAmount)}\n          </p>\n        </div>\n        <div className="rounded-xl bg-white/15 p-3">\n          <p className="opacity-80">지급 상금</p>\n          <p className="text-lg font-bold">{formatPlainAmount(poolPaidPrizeAmount)}</p>\n          <p className="mt-1 text-xs opacity-75">\n            홀상금 {formatPlainAmount(poolMainPaidPrizeAmount)} + 니어상금 {formatPlainAmount(poolNearPaidPrizeAmount)}\n          </p>\n        </div>\n        <div className="rounded-xl bg-white/15 p-3">\n          <p className="opacity-80">잔여상금</p>\n          <p className="text-lg font-bold">{formatPlainAmount(poolRemainingPrizeAmount)}</p>\n          <p className="mt-1 text-xs opacity-75">\n            총상금 + OECD 공통pot - 지급상금\n          </p>\n        </div>\n      </div>\n      {oecdCommonPotForBalance > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">\n          <p className="font-semibold">OECD 공통 pot</p>\n          <p>{formatPlainAmount(oecdCommonPotForBalance)}</p>\n        </div>\n      )}\n      {latePrizeBoostSettlementSummary.totalExtraPrizeAmount > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">\n          <p className="font-semibold">종반전 추가 상금</p>\n          <p>배정 총액: {formatPlainAmount(latePrizeBoostSettlementSummary.totalExtraPrizeAmount)}</p>\n          <p>미지급 추가 상금: {formatPlainAmount(latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount)}</p>\n        </div>\n      )}\n    </section>\n  ) : null;\n\n  return (`,
  `총상금 + OECD 공통pot - 지급상금`
);

// 6) Fix OECD entry fee calculation on the initial settings screen to include near prize pool per player.
const notStartedIndex = source.indexOf(`  if (!hasStarted) {`);
const entryStart = source.indexOf(`    const oecdEntryFeePerPlayer = (() => {`, notStartedIndex);
if (entryStart === -1) {
  skipped.push("OECD entry fee near inclusion: missing start anchor");
} else if (source.includes(`const nearEntryFeePerPlayer = nearEnabled`)) {
  skipped.push("OECD entry fee near inclusion: already applied");
} else {
  const entryEndMarker = `    })();`;
  const entryEnd = source.indexOf(entryEndMarker, entryStart);

  if (entryEnd === -1) {
    skipped.push("OECD entry fee near inclusion: missing end anchor");
  } else {
    const replacement = `    const oecdEntryFeePerPlayer = (() => {\n      const nearHoleCountForEntryFee = 4;\n      const nearEntryFeePerPlayer =\n        nearEnabled && nearAmount > 0\n          ? (nearAmount * nearHoleCountForEntryFee) / selectedPlayerCount\n          : 0;\n\n      if (settings.mode === "skins") {\n        return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFeePerPlayer;\n      }\n\n      if (settings.mode === "vegas") {\n        return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFeePerPlayer;\n      }\n\n      if (settings.mode === "hussein") {\n        return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFeePerPlayer;\n      }\n\n      if (settings.mode === "school") {\n        return (\n          ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) /\n            selectedPlayerCount +\n          nearEntryFeePerPlayer\n        );\n      }\n\n      if (settings.mode === "cycle") {\n        return (\n          (settings.cycle.skinsAmount +\n            settings.cycle.husseinAmount +\n            settings.cycle.vegasAmount) /\n            selectedPlayerCount +\n          nearEntryFeePerPlayer\n        );\n      }\n\n      return nearEntryFeePerPlayer;\n    })();`;

    source = source.slice(0, entryStart) + replacement + source.slice(entryEnd + entryEndMarker.length);
    applied.push("OECD entry fee near inclusion");
  }
}

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
