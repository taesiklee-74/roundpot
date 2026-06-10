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

  const insertAt = index + search.length;
  source = source.slice(0, insertAt) + insertion + source.slice(insertAt);
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

function tryScoreRowPatch() {
  if (source.includes("const oecdStatus = currentOecdStatuses.find")) {
    skipped.push("score row OECD status: already applied");
    return;
  }

  const needle = "const scoreToPar = getDisplayScoreToPar(scores, currentHole, player.id);";
  const start = source.indexOf(needle);
  if (start === -1) {
    skipped.push("score row OECD status: missing scoreToPar anchor");
    return;
  }

  const afterNeedle = start + needle.length;
  const returnIndex = source.indexOf("return (", afterNeedle);
  if (returnIndex === -1) {
    skipped.push("score row OECD status: missing return anchor");
    return;
  }

  const between = source.slice(afterNeedle, returnIndex);
  const replacement = `\n                const oecdStatus = currentOecdStatuses.find(\n                  (status) => status.playerId === player.id\n                );\n\n                `;

  source = source.slice(0, afterNeedle) + replacement + source.slice(returnIndex);
  applied.push("score row OECD status");
}

replaceOnce(
  "component imports",
  `import NearWinnerSelector from "./components/NearWinnerSelector";\nimport RoundShareCard from "./components/RoundShareCard";`,
  `import NearWinnerSelector from "./components/NearWinnerSelector";\nimport OecdPenaltyInputSection from "./components/OecdPenaltyInputSection";\nimport OecdSettingsCard from "./components/OecdSettingsCard";\nimport RoundShareCard from "./components/RoundShareCard";`
);

replaceOnce(
  "betting type imports",
  `  type GameResult,\n  type Hole,\n  type Player,`,
  `  type GameResult,\n  type Hole,\n  type HoleOecdPenalty,\n  type OecdPlayerStatus,\n  type Player,`
);

replaceOnce(
  "oecd helper import",
  `import {\n  calculateNearSettlementSummary,\n  getNearGameKindFromPreview,\n  getNearResultForHole,\n  upsertNearResult,\n  type NearGameKind,\n  type NearResult,\n} from "../src/lib/betting/near";`,
  `import {\n  calculateNearSettlementSummary,\n  getNearGameKindFromPreview,\n  getNearResultForHole,\n  upsertNearResult,\n  type NearGameKind,\n  type NearResult,\n} from "../src/lib/betting/near";\nimport {\n  calculateOecdSettlementSummary,\n  calculateOecdStatusesForHole,\n  getOecdStatusLabel,\n  upsertOecdPenalty,\n} from "../src/lib/betting/oecd";`
);

replaceOnce(
  "saved state oecd penalties",
  `  nearResults: NearResult[];\n  savedAt: string;`,
  `  nearResults: NearResult[];\n  oecdPenalties: HoleOecdPenalty[];\n  savedAt: string;`
);

replaceOnce(
  "ensure settings oecd shape",
  `      school: { ...defaults.school, ...settings.school },\n      cycle: { ...defaults.cycle, ...settings.cycle },`,
  `      school: { ...defaults.school, ...settings.school },\n      cycle: { ...defaults.cycle, ...settings.cycle },\n      oecd: { ...defaults.oecd, ...settings.oecd },`
);

insertBefore(
  "cumulative helper functions",
  `function getGameModeLabel(mode: BettingMode): string {`,
  `function getScoresBeforeHole(params: {\n  scores: Score[];\n  holes: Hole[];\n  targetHoleNumber: number;\n}): Score[] {\n  const { scores, holes, targetHoleNumber } = params;\n  const holeById = new Map(holes.map((hole) => [hole.id, hole]));\n\n  return scores.map((score) => {\n    const hole = holeById.get(score.holeId);\n\n    if (!hole || hole.holeNumber < targetHoleNumber) {\n      return score;\n    }\n\n    return { ...score, strokes: null };\n  });\n}\n\nfunction getOecdSettingsForSettlement(settings: BettingSettingsV2) {\n  return {\n    ...settings.oecd,\n    penaltyDestination:\n      settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot",\n  };\n}\n\nfunction getCumulativePrizeTotalsBeforeHole(params: {\n  players: Player[];\n  holes: Hole[];\n  scores: Score[];\n  settings: BettingSettingsV2;\n  vegasTeamAssignments: TeamAssignment[];\n  husseinAssignments: HusseinAssignment[];\n  nearEnabled: boolean;\n  nearAmount: number;\n  nearResults: NearResult[];\n  oecdPenalties: HoleOecdPenalty[];\n  targetHoleNumber: number;\n}): Record<string, number> {\n  const scoresBeforeHole = getScoresBeforeHole({\n    scores: params.scores,\n    holes: params.holes,\n    targetHoleNumber: params.targetHoleNumber,\n  });\n\n  const calculationBeforeHole = getActiveCalculation({\n    players: params.players,\n    holes: params.holes,\n    scores: scoresBeforeHole,\n    settings: params.settings,\n    vegasTeamAssignments: params.vegasTeamAssignments,\n    husseinAssignments: params.husseinAssignments,\n  });\n\n  const gameTotals = calculationBeforeHole\n    ? calculateSettlementSummary({\n        players: params.players,\n        gameResults: { [params.settings.mode]: calculationBeforeHole.gameResult },\n        strokeBet: calculationBeforeHole.strokeBet,\n      })\n    : null;\n\n  const nearBeforeHole = calculateNearSettlementSummary({\n    playerIds: params.players.map((player) => player.id),\n    nearEnabled: params.nearEnabled,\n    nearAmount: params.nearAmount,\n    nearResults: params.nearResults.filter(\n      (result) => result.holeNumber < params.targetHoleNumber\n    ),\n    vegasTeamAssignments: params.vegasTeamAssignments,\n    nearHoleCount: 4,\n  });\n\n  const oecdBeforeHole = calculateOecdSettlementSummary({\n    players: params.players,\n    penalties: params.oecdPenalties.filter(\n      (penalty) => penalty.holeNumber < params.targetHoleNumber\n    ),\n    settings: getOecdSettingsForSettlement(params.settings),\n    gameResult: calculationBeforeHole?.gameResult ?? null,\n  });\n\n  return params.players.reduce<Record<string, number>>((acc, player) => {\n    const gameTotal =\n      gameTotals?.players.find((summary) => summary.playerId === player.id)\n        ?.totalPrizeAmount ?? 0;\n    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;\n    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdTotal;\n    return acc;\n  }, {});\n}\n\nfunction getCumulativePrizeTotalsByHoleNumber(params: {\n  players: Player[];\n  holes: Hole[];\n  scores: Score[];\n  settings: BettingSettingsV2;\n  vegasTeamAssignments: TeamAssignment[];\n  husseinAssignments: HusseinAssignment[];\n  nearEnabled: boolean;\n  nearAmount: number;\n  nearResults: NearResult[];\n  oecdPenalties: HoleOecdPenalty[];\n}): Record<number, Record<string, number>> {\n  const result: Record<number, Record<string, number>> = {};\n\n  for (const hole of params.holes) {\n    result[hole.holeNumber] = getCumulativePrizeTotalsBeforeHole({\n      ...params,\n      targetHoleNumber: hole.holeNumber,\n    });\n  }\n\n  return result;\n}\n\n`,
  "function getScoresBeforeHole(params:"
);

replaceOnce(
  "oecd state",
  `  const [nearResults, setNearResults] = useState<NearResult[]>([]);`,
  `  const [nearResults, setNearResults] = useState<NearResult[]>([]);\n  const [oecdPenalties, setOecdPenalties] = useState<HoleOecdPenalty[]>([]);`
);

replaceOnce(
  "load oecd penalties",
  `      setNearResults(Array.isArray(saved.nearResults) ? saved.nearResults : []);\n      setLastSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);`,
  `      setNearResults(Array.isArray(saved.nearResults) ? saved.nearResults : []);\n      setOecdPenalties(\n        Array.isArray(saved.oecdPenalties) ? saved.oecdPenalties : []\n      );\n      setLastSavedAt(typeof saved.savedAt === "string" ? saved.savedAt : null);`
);

replaceOnce(
  "save oecd penalties payload",
  `      nearAmount,\n      nearResults,\n      savedAt,`,
  `      nearAmount,\n      nearResults,\n      oecdPenalties,\n      savedAt,`
);

replaceOnce(
  "save effect deps oecd",
  `    nearEnabled,\n    nearAmount,\n    nearResults,\n    ]);`,
  `    nearEnabled,\n    nearAmount,\n    nearResults,\n    oecdPenalties,\n    ]);`
);

replaceOnce(
  "oecd settlement memo",
  `  const nearSettlementSummary = useMemo(\n  () =>\n    calculateNearSettlementSummary({\n      playerIds: players.map((player) => player.id),\n      nearEnabled,\n      nearAmount,\n      nearResults,\n      vegasTeamAssignments,\n      nearHoleCount: 4,\n    }),\n  [players, nearEnabled, nearAmount, nearResults, vegasTeamAssignments]\n  );`,
  `  const nearSettlementSummary = useMemo(\n  () =>\n    calculateNearSettlementSummary({\n      playerIds: players.map((player) => player.id),\n      nearEnabled,\n      nearAmount,\n      nearResults,\n      vegasTeamAssignments,\n      nearHoleCount: 4,\n    }),\n  [players, nearEnabled, nearAmount, nearResults, vegasTeamAssignments]\n  );\n\n  const oecdSettlementSummary = useMemo(\n    () =>\n      calculateOecdSettlementSummary({\n        players,\n        penalties: oecdPenalties,\n        settings: getOecdSettingsForSettlement(settings),\n        gameResult: activeCalculation?.gameResult ?? null,\n      }),\n    [players, oecdPenalties, settings, activeCalculation]\n  );`
);

replaceOnce(
  "round summary oecd total",
  `            const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];\n            const nearTotalAmount = nearSettlement?.totalAmount ?? 0;\n\n            return {\n              playerId: summary.playerId,\n              playerName: summary.playerName,\n              totalAmount: summary.totalPrizeAmount + nearTotalAmount,\n            };`,
  `            const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];\n            const nearTotalAmount = nearSettlement?.totalAmount ?? 0;\n            const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n\n            return {\n              playerId: summary.playerId,\n              playerName: summary.playerName,\n              totalAmount: summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount,\n            };`
);

replaceOnce(
  "current oecd statuses memo",
  `  const currentHole = holes[currentHoleIndex];`,
  `  const currentHole = holes[currentHoleIndex];\n\n  const cumulativeBeforeHoleByNumber = useMemo(\n    () =>\n      getCumulativePrizeTotalsByHoleNumber({\n        players,\n        holes,\n        scores,\n        settings,\n        vegasTeamAssignments,\n        husseinAssignments,\n        nearEnabled,\n        nearAmount,\n        nearResults,\n        oecdPenalties,\n      }),\n    [\n      players,\n      holes,\n      scores,\n      settings,\n      vegasTeamAssignments,\n      husseinAssignments,\n      nearEnabled,\n      nearAmount,\n      nearResults,\n      oecdPenalties,\n    ]\n  );\n\n  const currentOecdStatuses = useMemo<OecdPlayerStatus[]>(() => {\n    if (!currentHole) return [];\n\n    return calculateOecdStatusesForHole({\n      players,\n      holes,\n      currentHole,\n      cumulativeBeforeHoleByPlayer:\n        cumulativeBeforeHoleByNumber[currentHole.holeNumber] ?? {},\n      cumulativeBeforeHoleByNumber,\n      settings: settings.oecd,\n    });\n  }, [players, holes, currentHole, cumulativeBeforeHoleByNumber, settings.oecd]);`
);

replaceOnce(
  "start round reset oecd",
  `    setNearResults([]);\n    setVegasDrawAnimation(null);`,
  `    setNearResults([]);\n    setOecdPenalties([]);\n    setVegasDrawAnimation(null);`
);

replaceOnce(
  "reset round oecd",
  `    setNearResults([]);\n    setVegasDrawAnimation(null);`,
  `    setNearResults([]);\n    setOecdPenalties([]);\n    setVegasDrawAnimation(null);`
);

insertBefore(
  "update oecd penalty function",
  `function getManualVegasTeamAssignmentForHole(holeId: string) {`,
  `function updateOecdPenalty(penalty: HoleOecdPenalty) {\n  setOecdPenalties((prev) => upsertOecdPenalty(prev, penalty));\n}\n\n`,
  "function updateOecdPenalty(penalty: HoleOecdPenalty)"
);

replaceOnce(
  "oecd entry fee",
  `    const selectedPlayerCount = Math.max(1, playerNames.filter((name) => name.trim()).length);`,
  `    const selectedPlayerCount = Math.max(1, playerNames.filter((name) => name.trim()).length);\n    const oecdEntryFeePerPlayer = (() => {\n      if (settings.mode === "skins") return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount;\n      if (settings.mode === "vegas") return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount;\n      if (settings.mode === "hussein") return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount;\n      if (settings.mode === "school") {\n        return ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) / selectedPlayerCount;\n      }\n      if (settings.mode === "cycle") {\n        return (settings.cycle.skinsAmount + settings.cycle.husseinAmount + settings.cycle.vegasAmount) / selectedPlayerCount;\n      }\n      return 0;\n    })();`
);

insertBefore(
  "oecd settings card render",
  `          <button\n            className="w-full rounded-2xl bg-neutral-900 px-5 py-4 text-lg font-bold text-white shadow-sm"`,
  `          <OecdSettingsCard\n            settings={settings.oecd}\n            entryFeePerPlayer={oecdEntryFeePerPlayer}\n            isSkinsMode={settings.mode === "skins"}\n            formatPlainAmount={formatPlainAmount}\n            onChange={(value) => updateSettings("oecd", value)}\n          />\n\n`,
  "<OecdSettingsCard"
);

replaceOnce(
  "current preview oecd prop",
  `          handicapAdjustments={currentHandicapAdjustments}\n          handicapEligiblePlayers={currentHandicapEligiblePlayers}\n        />`,
  `          handicapAdjustments={currentHandicapAdjustments}\n          handicapEligiblePlayers={currentHandicapEligiblePlayers}\n          oecdStatuses={settings.oecd.enabled ? currentOecdStatuses : []}\n        />`
);

tryScoreRowPatch();

replaceOnce(
  "score row status display",
  `                    <span className="font-medium">{player.name}</span>\n                    <p className="text-xs text-neutral-500">실제 {strokes}타</p>`,
  `                    <span className="font-medium">{player.name}</span>\n                    <p className="text-xs text-neutral-500">\n                      {settings.oecd.enabled\n                        ? getOecdStatusLabel(oecdStatus)\n                        : "OECD 사용 안함"}\n                    </p>`
);

insertBefore(
  "oecd penalty section render",
  `          {settings.mode === "vegas" &&`,
  `          <OecdPenaltyInputSection\n            enabled={settings.oecd.enabled}\n            hole={currentHole}\n            players={players}\n            statuses={currentOecdStatuses}\n            penalties={oecdPenalties}\n            formatPlainAmount={formatPlainAmount}\n            onChangePenalty={updateOecdPenalty}\n          />\n\n`,
  "<OecdPenaltyInputSection"
);

replaceOnce(
  "medal rows oecd total",
  `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];\n    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;\n    const totalAmountWithNear = summary.totalPrizeAmount + nearTotalAmount;\n\n    return {\n      playerId: summary.playerId,\n      playerName: summary.playerName,\n      amount: totalAmountWithNear,\n    };`,
  `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];\n    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;\n    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n    const totalAmountWithNear =\n      summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount;\n\n    return {\n      playerId: summary.playerId,\n      playerName: summary.playerName,\n      amount: totalAmountWithNear,\n    };`
);

insertBefore(
  "oecd settlement section",
  `  const strokeSettlementSection =`,
  `  const oecdSettlementSection =\n    settings.oecd.enabled &&\n    (oecdSettlementSummary.totalPenaltyAmount > 0 ||\n      oecdSettlementSummary.commonPotAmount > 0 ||\n      oecdSettlementSummary.winnerPaidAmount > 0) ? (\n      <section className="rounded-2xl bg-white p-5 shadow-sm">\n        <h2 className="text-lg font-bold">OECD 정산</h2>\n        <p className="mt-1 text-sm text-neutral-500">\n          수동 입력한 OECD 벌금이 총획득 상금에 반영됩니다.\n        </p>\n        <div className="mt-3 space-y-2">\n          {oecdSettlementSummary.players\n            .filter((summary) => summary.totalAmount !== 0)\n            .map((summary) => (\n              <div key={summary.playerId} className="rounded-xl bg-rose-50 p-3">\n                <div className="flex items-center justify-between">\n                  <span className="font-medium">{getPlayerName(players, summary.playerId)}</span>\n                  <span className="font-bold text-rose-700">{formatAmount(summary.totalAmount)}</span>\n                </div>\n                {summary.breakdowns.length > 0 && (\n                  <p className="mt-1 text-xs text-rose-800">{summary.breakdowns.join(" · ")}</p>\n                )}\n              </div>\n            ))}\n        </div>\n        {oecdSettlementSummary.commonPotAmount > 0 && (\n          <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">\n            <p className="font-semibold">OECD 공통 pot</p>\n            <p>{formatPlainAmount(oecdSettlementSummary.commonPotAmount)}</p>\n          </div>\n        )}\n      </section>\n    ) : null;\n\n`,
  "const oecdSettlementSection ="
);

replaceOnce(
  "show prize pool oecd",
  `    Boolean(activeCalculation.poolSummary) || nearSettlementSummary.totalPool > 0;`,
  `    Boolean(activeCalculation.poolSummary) ||\n    nearSettlementSummary.totalPool > 0 ||\n    oecdSettlementSummary.commonPotAmount > 0;`
);

insertBefore(
  "prize pool oecd common pot",
  `      {nearSettlementSummary.totalPool > 0 && (`,
  `      {oecdSettlementSummary.commonPotAmount > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">\n          <p className="font-semibold">OECD 공통 pot</p>\n          <p>OECD 누적 벌금: {formatPlainAmount(oecdSettlementSummary.commonPotAmount)}</p>\n        </div>\n      )}\n`,
  "OECD 누적 벌금:"
);

insertAfter(
  "latest result oecd section",
  `            {latestPrizeSection}`,
  `\n            {oecdSettlementSection}`,
  "{oecdSettlementSection}"
);

insertAfter(
  "settlement screen oecd section",
  `            {nearSettlementSection}`,
  `\n            {oecdSettlementSection}`,
  "{oecdSettlementSection}"
);

insertAfter(
  "final screen oecd section",
  `            {nearSettlementSection}`,
  `\n            {oecdSettlementSection}`,
  "{oecdSettlementSection}"
);

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) {
  console.log(applied.map((item) => `  + ${item}`).join("\n"));
}
if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} step(s).`);
  console.log(skipped.map((item) => `  - ${item}`).join("\n"));
}
