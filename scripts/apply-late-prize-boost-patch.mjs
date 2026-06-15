#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;
const applied = [];
const skipped = [];

function replaceOnce(label, search, replacement) {
  if (source.includes(replacement)) {
    skipped.push(`${label}: already applied`);
    return;
  }
  if (!source.includes(search)) {
    skipped.push(`${label}: missing anchor`);
    return;
  }
  source = source.replace(search, replacement);
  applied.push(label);
}

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

replaceOnce(
  "LatePrizeBoostPrompt import",
  `import OecdSettingsCard from "./components/OecdSettingsCard";\nimport RoundShareCard from "./components/RoundShareCard";`,
  `import OecdSettingsCard from "./components/OecdSettingsCard";\nimport LatePrizeBoostPrompt from "./components/LatePrizeBoostPrompt";\nimport RoundShareCard from "./components/RoundShareCard";`
);

insertAfter(
  "late prize boost helper import",
  `import {\n  calculateOecdSettlementSummary,\n  calculateOecdStatusesForHole,\n  getOecdStatusLabel,\n  upsertOecdPenalty,\n} from "../src/lib/betting/oecd";`,
  `\nimport {\n  acceptLatePrizeBoostOffer,\n  calculateLatePrizeBoostSettlementSummary,\n  calculateRemainingNearBaseAmount,\n  createDefaultLatePrizeBoostDecision,\n  createLatePrizeBoostOffer,\n  declineLatePrizeBoostOffer,\n  getBaseMainPrizeAmount,\n  normalizeLatePrizeBoostDecision,\n  type LatePrizeBoostDecision,\n} from "../src/lib/betting/latePrizeBoost";`,
  `from "../src/lib/betting/latePrizeBoost"`
);

replaceOnce(
  "SavedRoundState late prize boost",
  `  oecdPenalties: HoleOecdPenalty[];\n  savedAt: string;`,
  `  oecdPenalties: HoleOecdPenalty[];\n  latePrizeBoostDecision: LatePrizeBoostDecision;\n  savedAt: string;`
);

replaceOnce(
  "late prize boost state",
  `  const [oecdPenalties, setOecdPenalties] = useState<HoleOecdPenalty[]>([]);`,
  `  const [oecdPenalties, setOecdPenalties] = useState<HoleOecdPenalty[]>([]);\n  const [latePrizeBoostDecision, setLatePrizeBoostDecision] =\n    useState<LatePrizeBoostDecision>(() => createDefaultLatePrizeBoostDecision());`
);

replaceOnce(
  "load late prize boost decision",
  `      setOecdPenalties(\n        Array.isArray(saved.oecdPenalties) ? saved.oecdPenalties : []\n      );\n      setLastSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);`,
  `      setOecdPenalties(\n        Array.isArray(saved.oecdPenalties) ? saved.oecdPenalties : []\n      );\n      setLatePrizeBoostDecision(\n        normalizeLatePrizeBoostDecision(saved.latePrizeBoostDecision)\n      );\n      setLastSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);`
);

replaceOnce(
  "save late prize boost decision payload",
  `      oecdPenalties,\n      savedAt,`,
  `      oecdPenalties,\n      latePrizeBoostDecision,\n      savedAt,`
);

replaceOnce(
  "save deps late prize boost decision",
  `    nearResults,\n    oecdPenalties,\n    ]);`,
  `    nearResults,\n    oecdPenalties,\n    latePrizeBoostDecision,\n    ]);`
);

insertAfter(
  "late prize boost settlement memo",
  `  const oecdSettlementSummary = useMemo(\n    () =>\n      calculateOecdSettlementSummary({\n        players,\n        penalties: oecdPenalties,\n        settings: getOecdSettingsForSettlement(settings),\n        gameResult: activeCalculation?.gameResult ?? null,\n      }),\n    [players, oecdPenalties, settings, activeCalculation]\n  );`,
  `\n\n  const latePrizeBoostSettlementSummary = useMemo(\n    () =>\n      calculateLatePrizeBoostSettlementSummary({\n        players,\n        decision: latePrizeBoostDecision,\n        gameResult: activeCalculation?.gameResult ?? null,\n      }),\n    [players, latePrizeBoostDecision, activeCalculation]\n  );`,
  `const latePrizeBoostSettlementSummary = useMemo`
);

replaceOnce(
  "round summary includes late prize boost",
  `            const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n\n            return {\n              playerId: summary.playerId,\n              playerName: summary.playerName,\n              totalAmount: summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount,\n            };`,
  `            const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n            const latePrizeBoostTotalAmount =\n              latePrizeBoostSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n\n            return {\n              playerId: summary.playerId,\n              playerName: summary.playerName,\n              totalAmount:\n                summary.totalPrizeAmount +\n                nearTotalAmount +\n                oecdTotalAmount +\n                latePrizeBoostTotalAmount,\n            };`
);

insertAfter(
  "late prize boost offer memo",
  `  const currentOecdStatuses = useMemo<OecdPlayerStatus[]>(() => {\n    if (!currentHole) return [];\n\n    return calculateOecdStatusesForHole({\n      players,\n      holes,\n      currentHole,\n      cumulativeBeforeHoleByPlayer:\n        cumulativeBeforeHoleByNumber[currentHole.holeNumber] ?? {},\n      cumulativeBeforeHoleByNumber,\n      settings: settings.oecd,\n    });\n  }, [players, holes, currentHole, cumulativeBeforeHoleByNumber, settings.oecd]);`,
  `\n\n  const latePrizeBoostOffer = useMemo(() => {\n    if (!currentHole || !activeCalculation?.poolSummary) {\n      return null;\n    }\n\n    const remainingMainBaseAmount =\n      getBaseMainPrizeAmount(settings) *\n      holes.filter((hole) => hole.holeNumber >= currentHole.holeNumber).length;\n    const remainingNearBaseAmount = calculateRemainingNearBaseAmount({\n      holes,\n      currentHoleNumber: currentHole.holeNumber,\n      nearEnabled,\n      nearAmount,\n    });\n    const currentMainBalance = Math.max(\n      0,\n      activeCalculation.poolSummary.totalPool - activeCalculation.poolSummary.poolPaid\n    );\n    const currentTotalBalance =\n      currentMainBalance +\n      nearSettlementSummary.remainingPool +\n      oecdSettlementSummary.commonPotAmount;\n\n    return createLatePrizeBoostOffer({\n      holes,\n      currentHole,\n      settings,\n      decision: latePrizeBoostDecision,\n      currentTotalBalance,\n      remainingExpectedPayout: remainingMainBaseAmount + remainingNearBaseAmount,\n    });\n  }, [\n    currentHole,\n    activeCalculation,\n    settings,\n    holes,\n    nearEnabled,\n    nearAmount,\n    nearSettlementSummary.remainingPool,\n    oecdSettlementSummary.commonPotAmount,\n    latePrizeBoostDecision,\n  ]);`,
  `const latePrizeBoostOffer = useMemo`
);

insertBefore(
  "late prize boost handlers",
  `function returnToPlay() {`,
  `function acceptLatePrizeBoost() {\n  if (!latePrizeBoostOffer?.shouldOffer) return;\n\n  setLatePrizeBoostDecision((prev) =>\n    acceptLatePrizeBoostOffer({\n      decision: prev,\n      offer: latePrizeBoostOffer,\n    })\n  );\n}\n\nfunction declineLatePrizeBoost() {\n  if (!latePrizeBoostOffer) return;\n\n  setLatePrizeBoostDecision((prev) =>\n    declineLatePrizeBoostOffer(prev, latePrizeBoostOffer.holeNumber)\n  );\n}\n\n`,
  `function acceptLatePrizeBoost()`
);

// Reset late prize boost decisions whenever a new round starts or resets.
if (!source.includes("setLatePrizeBoostDecision(createDefaultLatePrizeBoostDecision());")) {
  const resetCountBefore = (source.match(/setOecdPenalties\(\[\]\);/g) ?? []).length;
  source = source.replace(
    /setOecdPenalties\(\[\]\);/g,
    `setOecdPenalties([]);\n    setLatePrizeBoostDecision(createDefaultLatePrizeBoostDecision());`
  );
  if (resetCountBefore > 0) {
    applied.push(`reset late prize boost decision in ${resetCountBefore} place(s)`);
  } else {
    skipped.push("reset late prize boost decision: no oecd reset anchors");
  }
} else {
  skipped.push("reset late prize boost decision: already applied");
}

replaceOnce(
  "medal rows include late prize boost",
  `    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n    const totalAmountWithNear =\n      summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount;`,
  `    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n    const latePrizeBoostTotalAmount =\n      latePrizeBoostSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n    const totalAmountWithNear =\n      summary.totalPrizeAmount +\n      nearTotalAmount +\n      oecdTotalAmount +\n      latePrizeBoostTotalAmount;`
);

insertBefore(
  "late prize boost settlement section",
  `  const nearSettlementSection =`,
  `  const latePrizeBoostSettlementSection =\n    latePrizeBoostSettlementSummary.totalExtraPrizeAmount > 0 ? (\n      <section className="rounded-2xl bg-white p-5 shadow-sm">\n        <h2 className="text-lg font-bold">종반전 추가 상금</h2>\n        <p className="mt-1 text-sm text-neutral-500">\n          16~18번 홀 시작 전 선택한 메인 게임 추가 상금입니다.\n        </p>\n        <div className="mt-3 space-y-2">\n          {latePrizeBoostSettlementSummary.players\n            .filter((summary) => summary.totalAmount !== 0)\n            .map((summary) => (\n              <div key={summary.playerId} className="rounded-xl bg-blue-50 p-3">\n                <div className="flex items-center justify-between">\n                  <span className="font-medium">{getPlayerName(players, summary.playerId)}</span>\n                  <span className="font-bold text-blue-700">\n                    {formatAmount(summary.totalAmount)}\n                  </span>\n                </div>\n                {summary.breakdowns.length > 0 && (\n                  <p className="mt-1 text-xs text-blue-800">\n                    {summary.breakdowns.join(" · ")}\n                  </p>\n                )}\n              </div>\n            ))}\n        </div>\n        {latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount > 0 && (\n          <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">\n            아직 지급되지 않은 종반전 추가 상금: {formatPlainAmount(latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount)}\n          </p>\n        )}\n      </section>\n    ) : null;\n\n`,
  `const latePrizeBoostSettlementSection =`
);

insertAfter(
  "late boost after latest prize",
  `            {latestPrizeSection}`,
  `\n            {latePrizeBoostSettlementSection}`,
  `{latePrizeBoostSettlementSection}`
);

insertAfter(
  "late boost after medal prize",
  `            {medalPrizeSection}`,
  `\n            {latePrizeBoostSettlementSection}`,
  `{latePrizeBoostSettlementSection}`
);

replaceOnce(
  "show prize pool includes late prize boost",
  `    nearSettlementSummary.totalPool > 0 ||\n    oecdSettlementSummary.commonPotAmount > 0;`,
  `    nearSettlementSummary.totalPool > 0 ||\n    oecdSettlementSummary.commonPotAmount > 0 ||\n    latePrizeBoostSettlementSummary.totalExtraPrizeAmount > 0;`
);

insertBefore(
  "prize pool late boost summary",
  `      {oecdSettlementSummary.commonPotAmount > 0 && (`,
  `      {latePrizeBoostSettlementSummary.totalExtraPrizeAmount > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">\n          <p className="font-semibold">종반전 추가 상금</p>\n          <p>배정 총액: {formatPlainAmount(latePrizeBoostSettlementSummary.totalExtraPrizeAmount)}</p>\n          <p>미지급 추가 상금: {formatPlainAmount(latePrizeBoostSettlementSummary.unpaidExtraPrizeAmount)}</p>\n        </div>\n      )}\n`,
  `종반전 추가 상금`
);

insertAfter(
  "render late prize boost prompt",
  `    <main className="min-h-screen bg-neutral-100 p-4 text-neutral-900">`,
  `\n      <LatePrizeBoostPrompt\n        offer={roundView === "play" ? latePrizeBoostOffer : null}\n        formatPlainAmount={formatPlainAmount}\n        onAccept={acceptLatePrizeBoost}\n        onDecline={declineLatePrizeBoost}\n      />`,
  `<LatePrizeBoostPrompt`
);

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
