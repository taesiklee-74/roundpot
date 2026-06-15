#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "app/page.tsx");
let s = readFileSync(file, "utf8");
const before = s;
const applied = [];
const skipped = [];

function mark(label, ok) {
  if (ok) applied.push(label);
  else skipped.push(label);
}

function replace(label, from, to) {
  if (s.includes(to)) {
    mark(label + ": already applied", false);
    return;
  }
  if (!s.includes(from)) {
    mark(label + ": missing anchor", false);
    return;
  }
  s = s.replace(from, to);
  mark(label, true);
}

function insertAfter(label, anchor, text, already) {
  if (s.includes(already ?? text.trim())) {
    mark(label + ": already applied", false);
    return;
  }
  const i = s.indexOf(anchor);
  if (i === -1) {
    mark(label + ": missing anchor", false);
    return;
  }
  s = s.slice(0, i + anchor.length) + text + s.slice(i + anchor.length);
  mark(label, true);
}

function insertInRangeAfter(label, rangeStartText, anchorText, text, alreadyText) {
  if (s.includes(alreadyText ?? text.trim())) {
    mark(label + ": already applied", false);
    return;
  }
  const start = s.indexOf(rangeStartText);
  if (start === -1) {
    mark(label + ": missing range start", false);
    return;
  }
  const anchor = s.indexOf(anchorText, start);
  if (anchor === -1) {
    mark(label + ": missing anchor", false);
    return;
  }
  s = s.slice(0, anchor + anchorText.length) + text + s.slice(anchor + anchorText.length);
  mark(label, true);
}

// 1. Include late prize boost in OECD eligibility current holdings.
replace(
  "add late boost param to before-hole helper",
  "  oecdPenalties: HoleOecdPenalty[];\n  targetHoleNumber: number;",
  "  oecdPenalties: HoleOecdPenalty[];\n  latePrizeBoostDecision?: LatePrizeBoostDecision;\n  targetHoleNumber: number;"
);

replace(
  "add late boost param to by-hole helper",
  "  oecdPenalties: HoleOecdPenalty[];\n}): Record<number, Record<string, number>> {",
  "  oecdPenalties: HoleOecdPenalty[];\n  latePrizeBoostDecision?: LatePrizeBoostDecision;\n}): Record<number, Record<string, number>> {"
);

insertAfter(
  "calculate late boost before hole",
  "  const oecdBeforeHole = calculateOecdSettlementSummary({\n    players: params.players,\n    penalties: params.oecdPenalties.filter(\n      (penalty) => penalty.holeNumber < params.targetHoleNumber\n    ),\n    settings: getOecdSettingsForSettlement(params.settings),\n    gameResult: calculationBeforeHole?.gameResult ?? null,\n  });",
  "\n\n  const latePrizeBoostBeforeHole = calculateLatePrizeBoostSettlementSummary({\n    players: params.players,\n    decision: {\n      acceptedAtHoleNumber:\n        params.latePrizeBoostDecision?.acceptedAtHoleNumber ?? null,\n      declinedHoleNumbers:\n        params.latePrizeBoostDecision?.declinedHoleNumbers ?? [],\n      allocations: (params.latePrizeBoostDecision?.allocations ?? []).filter(\n        (allocation) => allocation.holeNumber < params.targetHoleNumber\n      ),\n    },\n    gameResult: calculationBeforeHole?.gameResult ?? null,\n  });",
  "const latePrizeBoostBeforeHole = calculateLatePrizeBoostSettlementSummary"
);

replace(
  "add late boost total to current holdings",
  "    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;\n    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdTotal;",
  "    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;\n    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;\n    const latePrizeBoostTotal =\n      latePrizeBoostBeforeHole.byPlayerId[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdTotal + latePrizeBoostTotal;"
);

insertInRangeAfter(
  "pass late boost decision to cumulative memo call",
  "const cumulativeBeforeHoleByNumber",
  "        oecdPenalties,",
  "\n        latePrizeBoostDecision,",
  "latePrizeBoostDecision,\n      })"
);

insertInRangeAfter(
  "add late boost decision to cumulative memo deps",
  "const cumulativeBeforeHoleByNumber",
  "      oecdPenalties,",
  "\n      latePrizeBoostDecision,",
  "latePrizeBoostDecision,\n    ]"
);

// 2. Show late-prize popup only on the play screen, not latest-result.
replace(
  "pending offer effect play only",
  "(roundView !== \"play\" && roundView !== \"latest-result\") ||",
  "roundView !== \"play\" ||"
);

replace(
  "prompt prop play only condition",
  "hasStarted && (roundView === \"play\" || roundView === \"latest-result\")",
  "hasStarted && roundView === \"play\""
);

// 3. Current-game card should show late boost amount in prize.
const boostedPreviewExpr = [
  "{currentGamePreviewForDisplay && currentHole",
  "  ? (() => {",
  "      const allocation = latePrizeBoostDecision.allocations.find(",
  "        (item) => item.holeId === currentHole.id",
  "      );",
  "      if (!allocation || allocation.extraMainPrizeAmount <= 0) {",
  "        return currentGamePreviewForDisplay;",
  "      }",
  "      return {",
  "        ...currentGamePreviewForDisplay,",
  "        prizeAmount:",
  "          currentGamePreviewForDisplay.prizeAmount +",
  "          allocation.extraMainPrizeAmount,",
  "        description:",
  "          currentGamePreviewForDisplay.description +",
  "          \" 종반전 추가상금 \" +",
  "          formatPlainAmount(allocation.extraMainPrizeAmount) +",
  "          \" 포함.\",",
  "      };",
  "    })()",
  "  : currentGamePreviewForDisplay}"
].join("\n");

replace(
  "current preview card uses boosted preview",
  "preview={currentGamePreviewForDisplay}",
  "preview=" + boostedPreviewExpr
);

// 4. After round completion, return to the 18th/latest-result screen, not final-share.
s = s.replace(
  /if \(firstIncompleteHoleIndex !== null\) \{\n\s*setCurrentHoleIndex\(firstIncompleteHoleIndex\);\n\s*setRoundView\("play"\);\n\s*return;\n\s*\}\n\n\s*setRoundView\("final-share"\);/,
  (match) => {
    applied.push("return to latest-result after completion");
    return match.replace('setRoundView("final-share");', 'setRoundView("latest-result");');
  }
);

if (s !== before) {
  writeFileSync(file, s, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((x) => `  + ${x}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((x) => `  - ${x}`).join("\n"));
