#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "app/page.tsx");
let s = readFileSync(file, "utf8");
const before = s;
const applied = [];
const skipped = [];

function patch(label, from, to) {
  if (s.includes(to)) {
    skipped.push(`${label}: already applied`);
    return;
  }
  if (!s.includes(from)) {
    skipped.push(`${label}: missing anchor`);
    return;
  }
  s = s.replace(from, to);
  applied.push(label);
}

function insertAfter(label, anchor, text, already) {
  if (s.includes(already ?? text.trim())) {
    skipped.push(`${label}: already applied`);
    return;
  }
  const i = s.indexOf(anchor);
  if (i === -1) {
    skipped.push(`${label}: missing anchor`);
    return;
  }
  s = s.slice(0, i + anchor.length) + text + s.slice(i + anchor.length);
  applied.push(label);
}

// 1) OECD current holdings must include late prize boost allocations.
patch(
  "add late boost param to before-hole helper",
  `  oecdPenalties: HoleOecdPenalty[];
  targetHoleNumber: number;`,
  `  oecdPenalties: HoleOecdPenalty[];
  latePrizeBoostDecision?: LatePrizeBoostDecision;
  targetHoleNumber: number;`
);

patch(
  "add late boost param to by-hole helper",
  `  oecdPenalties: HoleOecdPenalty[];
}): Record<number, Record<string, number>> {`,
  `  oecdPenalties: HoleOecdPenalty[];
  latePrizeBoostDecision?: LatePrizeBoostDecision;
}): Record<number, Record<string, number>> {`
);

insertAfter(
  "calculate late boost before hole",
  `  const oecdBeforeHole = calculateOecdSettlementSummary({
    players: params.players,
    penalties: params.oecdPenalties.filter(
      (penalty) => penalty.holeNumber < params.targetHoleNumber
    ),
    settings: getOecdSettingsForSettlement(params.settings),
    gameResult: calculationBeforeHole?.gameResult ?? null,
  });`,
  `

  const latePrizeBoostBeforeHole = calculateLatePrizeBoostSettlementSummary({
    players: params.players,
    decision: {
      acceptedAtHoleNumber:
        params.latePrizeBoostDecision?.acceptedAtHoleNumber ?? null,
      declinedHoleNumbers: params.latePrizeBoostDecision?.declinedHoleNumbers ?? [],
      allocations: (params.latePrizeBoostDecision?.allocations ?? []).filter(
        (allocation) => allocation.holeNumber < params.targetHoleNumber
      ),
    },
    gameResult: calculationBeforeHole?.gameResult ?? null,
  });`,
  `const latePrizeBoostBeforeHole = calculateLatePrizeBoostSettlementSummary`
);

patch(
  "include late boost in OECD current holdings",
  `    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;
    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;

    acc[player.id] = gameTotal + nearTotal + oecdTotal;`,
  `    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;
    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;
    const latePrizeBoostTotal = latePrizeBoostBeforeHole.byPlayerId[player.id] ?? 0;

    acc[player.id] = gameTotal + nearTotal + oecdTotal + latePrizeBoostTotal;`
);

patch(
  "pass late boost to cumulative by-hole memo",
  `        nearResults,
        oecdPenalties,
      }),`,
  `        nearResults,
        oecdPenalties,
        latePrizeBoostDecision,
      }),`
);

patch(
  "cumulative deps include late boost",
  `      nearResults,
      oecdPenalties,
    ]`,
  `      nearResults,
      oecdPenalties,
      latePrizeBoostDecision,
    ]`
);

// 2) Late prize popup should appear on the target hole play screen only.
patch(
  "pending offer effect only on play",
  `(roundView !== "play" && roundView !== "latest-result") ||`,
  `roundView !== "play" ||`
);

patch(
  "prompt renders only on play",
  `hasStarted && (roundView === "play" || roundView === "latest-result")`,
  `hasStarted && roundView === "play"`
);

// 3) Current-game preview card should show the boosted prize amount.
insertAfter(
  "boost current game preview with late prize",
  `  const currentGamePreviewForDisplay =
    preview && settings.mode === "hussein" && currentHole.holeNumber === 1
      ? {
          ...preview,
          husseinPlayerId: manualFirstHusseinPlayerId || null,
        }
      : preview && shouldManuallySelectFirstVegasTeams
        ? {
            ...preview,
            description:
              manualVegasTeamAPlayerIds.length === 2
                ? "직접 선택한 팀 구성으로 라스베가스를 진행합니다."
                : "1번 홀 팀을 직접 선택해 주세요.",
            teams: firstVegasManualTeams,
          }
        : preview;`,
  `

  const currentLatePrizeBoostAllocation = currentHole
    ? latePrizeBoostDecision.allocations.find(
        (allocation) => allocation.holeId === currentHole.id
      ) ?? null
    : null;

  const boostedCurrentGamePreviewForDisplay =
    currentGamePreviewForDisplay &&
    currentLatePrizeBoostAllocation &&
    currentLatePrizeBoostAllocation.extraMainPrizeAmount > 0
      ? {
          ...currentGamePreviewForDisplay,
          prizeAmount:
            currentGamePreviewForDisplay.prizeAmount +
            currentLatePrizeBoostAllocation.extraMainPrizeAmount,
          description: `${currentGamePreviewForDisplay.description} 종반전 추가상금 ${formatPlainAmount(currentLatePrizeBoostAllocation.extraMainPrizeAmount)} 포함.`,
        }
      : currentGamePreviewForDisplay;`,
  `const boostedCurrentGamePreviewForDisplay =`
);

patch(
  "current preview card uses boosted preview",
  `preview={currentGamePreviewForDisplay}`,
  `preview={boostedCurrentGamePreviewForDisplay}`
);

// 4) After all holes are complete, returning from other screens should go to the 18th/latest result screen.
patch(
  "returnToPlay goes latest result after completion",
  `  if (firstIncompleteHoleIndex !== null) {
    setCurrentHoleIndex(firstIncompleteHoleIndex);
    setRoundView("play");
    return;
  }

  setRoundView("final-share");`,
  `  if (firstIncompleteHoleIndex !== null) {
    setCurrentHoleIndex(firstIncompleteHoleIndex);
    setRoundView("play");
    return;
  }

  setRoundView("latest-result");`
);

if (s !== before) {
  writeFileSync(file, s, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((x) => `  + ${x}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((x) => `  - ${x}`).join("\n"));
