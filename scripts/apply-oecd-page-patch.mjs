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
    throw new Error(`Cannot find patch anchor: ${label}`);
  }

  source = source.replace(search, replacement);
}

function replaceRegexOnce(label, regex, replacement, alreadyAppliedText = null) {
  if (alreadyAppliedText && source.includes(alreadyAppliedText)) {
    return;
  }

  if (!regex.test(source)) {
    throw new Error(`Cannot find patch anchor: ${label}`);
  }

  source = source.replace(regex, replacement);
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

replaceOnce(
  "cumulative helper functions",
  `function getGameModeLabel(mode: BettingMode): string {`,
  `function getScoresBeforeHole(params: {\n  scores: Score[];\n  holes: Hole[];\n  targetHoleNumber: number;\n}): Score[] {\n  const { scores, holes, targetHoleNumber } = params;\n  const holeById = new Map(holes.map((hole) => [hole.id, hole]));\n\n  return scores.map((score) => {\n    const hole = holeById.get(score.holeId);\n\n    if (!hole || hole.holeNumber < targetHoleNumber) {\n      return score;\n    }\n\n    return {\n      ...score,\n      strokes: null,\n    };\n  });\n}\n\nfunction getOecdSettingsForSettlement(settings: BettingSettingsV2) {\n  return {\n    ...settings.oecd,\n    penaltyDestination:\n      settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot",\n  };\n}\n\nfunction getCumulativePrizeTotalsBeforeHole(params: {\n  players: Player[];\n  holes: Hole[];\n  scores: Score[];\n  settings: BettingSettingsV2;\n  vegasTeamAssignments: TeamAssignment[];\n  husseinAssignments: HusseinAssignment[];\n  nearEnabled: boolean;\n  nearAmount: number;\n  nearResults: NearResult[];\n  oecdPenalties: HoleOecdPenalty[];\n  targetHoleNumber: number;\n}): Record<string, number> {\n  const {\n    players,\n    holes,\n    scores,\n    settings,\n    vegasTeamAssignments,\n    husseinAssignments,\n    nearEnabled,\n    nearAmount,\n    nearResults,\n    oecdPenalties,\n    targetHoleNumber,\n  } = params;\n\n  const scoresBeforeHole = getScoresBeforeHole({\n    scores,\n    holes,\n    targetHoleNumber,\n  });\n\n  const calculationBeforeHole = getActiveCalculation({\n    players,\n    holes,\n    scores: scoresBeforeHole,\n    settings,\n    vegasTeamAssignments,\n    husseinAssignments,\n  });\n\n  const gameTotals = calculationBeforeHole\n    ? calculateSettlementSummary({\n        players,\n        gameResults: {\n          [settings.mode]: calculationBeforeHole.gameResult,\n        },\n        strokeBet: calculationBeforeHole.strokeBet,\n      })\n    : null;\n\n  const nearBeforeHole = calculateNearSettlementSummary({\n    playerIds: players.map((player) => player.id),\n    nearEnabled,\n    nearAmount,\n    nearResults: nearResults.filter(\n      (result) => result.holeNumber < targetHoleNumber\n    ),\n    vegasTeamAssignments,\n    nearHoleCount: 4,\n  });\n\n  const oecdBeforeHole = calculateOecdSettlementSummary({\n    players,\n    penalties: oecdPenalties.filter(\n      (penalty) => penalty.holeNumber < targetHoleNumber\n    ),\n    settings: getOecdSettingsForSettlement(settings),\n    gameResult: calculationBeforeHole?.gameResult ?? null,\n  });\n\n  return players.reduce<Record<string, number>>((acc, player) => {\n    const gameTotal =\n      gameTotals?.players.find((summary) => summary.playerId === player.id)\n        ?.totalPrizeAmount ?? 0;\n    const nearTotal = nearBeforeHole.byPlayerId[player.id]?.totalAmount ?? 0;\n    const oecdTotal = oecdBeforeHole.byPlayerId[player.id] ?? 0;\n\n    acc[player.id] = gameTotal + nearTotal + oecdTotal;\n    return acc;\n  }, {});\n}\n\nfunction getCumulativePrizeTotalsByHoleNumber(params: {\n  players: Player[];\n  holes: Hole[];\n  scores: Score[];\n  settings: BettingSettingsV2;\n  vegasTeamAssignments: TeamAssignment[];\n  husseinAssignments: HusseinAssignment[];\n  nearEnabled: boolean;\n  nearAmount: number;\n  nearResults: NearResult[];\n  oecdPenalties: HoleOecdPenalty[];\n}): Record<number, Record<string, number>> {\n  const result: Record<number, Record<string, number>> = {};\n\n  for (const hole of params.holes) {\n    result[hole.holeNumber] = getCumulativePrizeTotalsBeforeHole({\n      ...params,\n      targetHoleNumber: hole.holeNumber,\n    });\n  }\n\n  return result;\n}\n\nfunction getGameModeLabel(mode: BettingMode): string {`
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
  "round summary deps oecd",
  `        });\n\n  const currentHole = holes[currentHoleIndex];`,
  `        });\n\n  const currentHole = holes[currentHoleIndex];\n\n  const cumulativeBeforeHoleByNumber = useMemo(\n    () =>\n      getCumulativePrizeTotalsByHoleNumber({\n        players,\n        holes,\n        scores,\n        settings,\n        vegasTeamAssignments,\n        husseinAssignments,\n        nearEnabled,\n        nearAmount,\n        nearResults,\n        oecdPenalties,\n      }),\n    [\n      players,\n      holes,\n      scores,\n      settings,\n      vegasTeamAssignments,\n      husseinAssignments,\n      nearEnabled,\n      nearAmount,\n      nearResults,\n      oecdPenalties,\n    ]\n  );\n\n  const currentOecdStatuses = useMemo<OecdPlayerStatus[]>(() => {\n    if (!currentHole) {\n      return [];\n    }\n\n    return calculateOecdStatusesForHole({\n      players,\n      holes,\n      currentHole,\n      cumulativeBeforeHoleByPlayer:\n        cumulativeBeforeHoleByNumber[currentHole.holeNumber] ?? {},\n      cumulativeBeforeHoleByNumber,\n      settings: settings.oecd,\n    });\n  }, [players, holes, currentHole, cumulativeBeforeHoleByNumber, settings.oecd]);`
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

replaceOnce(
  "update oecd penalty function",
  `function getManualVegasTeamAssignmentForHole(holeId: string) {`,
  `function updateOecdPenalty(penalty: HoleOecdPenalty) {\n  setOecdPenalties((prev) => upsertOecdPenalty(prev, penalty));\n}\n\nfunction getManualVegasTeamAssignmentForHole(holeId: string) {`
);

replaceOnce(
  "prestart oecd entry fee",
  `    const selectedPlayerCount = Math.max(1, playerNames.filter((name) => name.trim()).length);`,
  `    const selectedPlayerCount = Math.max(1, playerNames.filter((name) => name.trim()).length);\n    const oecdEntryFeePerPlayer = (() => {\n      if (settings.mode === "skins") {\n        return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount;\n      }\n\n      if (settings.mode === "vegas") {\n        return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount;\n      }\n\n      if (settings.mode === "hussein") {\n        return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount;\n      }\n\n      if (settings.mode === "school") {\n        return (\n          ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) /\n          selectedPlayerCount\n        );\n      }\n\n      if (settings.mode === "cycle") {\n        return (\n          (settings.cycle.skinsAmount +\n            settings.cycle.husseinAmount +\n            settings.cycle.vegasAmount) /\n          selectedPlayerCount\n        );\n      }\n\n      return 0;\n    })();`
);

replaceOnce(
  "oecd settings card render",
  `          <button\n            className="w-full rounded-2xl bg-neutral-900 px-5 py-4 text-lg font-bold text-white shadow-sm"`,
  `          <OecdSettingsCard\n            settings={settings.oecd}\n            entryFeePerPlayer={oecdEntryFeePerPlayer}\n            isSkinsMode={settings.mode === "skins"}\n            formatPlainAmount={formatPlainAmount}\n            onChange={(value) => updateSettings("oecd", value)}\n          />\n\n          <button\n            className="w-full rounded-2xl bg-neutral-900 px-5 py-4 text-lg font-bold text-white shadow-sm"`
);

replaceOnce(
  "current preview oecd prop",
  `          handicapAdjustments={currentHandicapAdjustments}\n          handicapEligiblePlayers={currentHandicapEligiblePlayers}\n        />`,
  `          handicapAdjustments={currentHandicapAdjustments}\n          handicapEligiblePlayers={currentHandicapEligiblePlayers}\n          oecdStatuses={settings.oecd.enabled ? currentOecdStatuses : []}\n        />`
);

replaceRegexOnce(
  "score row oecd status label",
  /                const scoreToPar = getDisplayScoreToPar\(scores, currentHole, player\.id\);\n                const strokes = currentHole\.par \+ scoreToPar;\n\n                return \(/,
  `                const scoreToPar = getDisplayScoreToPar(scores, currentHole, player.id);\n                const oecdStatus = currentOecdStatuses.find(\n                  (status) => status.playerId === player.id\n                );\n\n                return (`,
  `const oecdStatus = currentOecdStatuses.find`
);

replaceOnce(
  "remove actual strokes display",
  `                    <span className="font-medium">{player.name}</span>\n                    <p className="text-xs text-neutral-500">실제 {strokes}타</p>`,
  `                    <span className="font-medium">{player.name}</span>\n                    <p className="text-xs text-neutral-500">\n                      {settings.oecd.enabled\n                        ? getOecdStatusLabel(oecdStatus)\n                        : "OECD 사용 안함"}\n                    </p>`
);

replaceOnce(
  "oecd penalty section render",
  `          </div>\n\n          {settings.mode === "vegas" &&`,
  `          </div>\n\n          <OecdPenaltyInputSection\n            enabled={settings.oecd.enabled}\n            hole={currentHole}\n            players={players}\n            statuses={currentOecdStatuses}\n            penalties={oecdPenalties}\n            formatPlainAmount={formatPlainAmount}\n            onChangePenalty={updateOecdPenalty}\n          />\n\n          {settings.mode === "vegas" &&`
);

replaceOnce(
  "medal rows oecd total",
  `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];\n    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;\n    const totalAmountWithNear = summary.totalPrizeAmount + nearTotalAmount;\n\n    return {\n      playerId: summary.playerId,\n      playerName: summary.playerName,\n      amount: totalAmountWithNear,\n    };`,
  `    const nearSettlement = nearSettlementSummary.byPlayerId[summary.playerId];\n    const nearTotalAmount = nearSettlement?.totalAmount ?? 0;\n    const oecdTotalAmount = oecdSettlementSummary.byPlayerId[summary.playerId] ?? 0;\n    const totalAmountWithNear =\n      summary.totalPrizeAmount + nearTotalAmount + oecdTotalAmount;\n\n    return {\n      playerId: summary.playerId,\n      playerName: summary.playerName,\n      amount: totalAmountWithNear,\n    };`
);

replaceOnce(
  "oecd settlement section",
  `  const strokeSettlementSection =\n    settings.mode === "stroke" && settlementSummary.pairwiseSettlements.length > 0 ? (`,
  `  const oecdSettlementSection =\n    settings.oecd.enabled &&\n    (oecdSettlementSummary.totalPenaltyAmount > 0 ||\n      oecdSettlementSummary.commonPotAmount > 0 ||\n      oecdSettlementSummary.winnerPaidAmount > 0) ? (\n      <section className="rounded-2xl bg-white p-5 shadow-sm">\n        <h2 className="text-lg font-bold">OECD 정산</h2>\n        <p className="mt-1 text-sm text-neutral-500">\n          수동 입력한 OECD 벌금이 총획득 상금에 반영됩니다.\n        </p>\n\n        <div className="mt-3 space-y-2">\n          {oecdSettlementSummary.players\n            .filter((summary) => summary.totalAmount !== 0)\n            .map((summary) => (\n              <div key={summary.playerId} className="rounded-xl bg-rose-50 p-3">\n                <div className="flex items-center justify-between">\n                  <span className="font-medium">\n                    {getPlayerName(players, summary.playerId)}\n                  </span>\n                  <span className="font-bold text-rose-700">\n                    {formatAmount(summary.totalAmount)}\n                  </span>\n                </div>\n\n                {summary.breakdowns.length > 0 && (\n                  <p className="mt-1 text-xs text-rose-800">\n                    {summary.breakdowns.join(" · ")}\n                  </p>\n                )}\n              </div>\n            ))}\n        </div>\n\n        {oecdSettlementSummary.commonPotAmount > 0 && (\n          <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">\n            <p className="font-semibold">OECD 공통 pot</p>\n            <p>{formatPlainAmount(oecdSettlementSummary.commonPotAmount)}</p>\n          </div>\n        )}\n      </section>\n    ) : null;\n\n  const strokeSettlementSection =\n    settings.mode === "stroke" && settlementSummary.pairwiseSettlements.length > 0 ? (`
);

replaceOnce(
  "show prize pool oecd",
  `    Boolean(activeCalculation.poolSummary) || nearSettlementSummary.totalPool > 0;`,
  `    Boolean(activeCalculation.poolSummary) ||\n    nearSettlementSummary.totalPool > 0 ||\n    oecdSettlementSummary.commonPotAmount > 0;`
);

replaceOnce(
  "prize pool oecd common pot",
  `      {nearSettlementSummary.totalPool > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">`,
  `      {oecdSettlementSummary.commonPotAmount > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">\n          <p className="font-semibold">OECD 공통 pot</p>\n          <p>OECD 누적 벌금: {formatPlainAmount(oecdSettlementSummary.commonPotAmount)}</p>\n        </div>\n      )}\n      {nearSettlementSummary.totalPool > 0 && (\n        <div className="mt-3 rounded-xl bg-white/15 p-3 text-sm">`
);

replaceOnce(
  "latest result oecd section",
  `             {latestPrizeSection}            \n\n             {isLastHole ? (`,
  `             {latestPrizeSection}\n             {oecdSettlementSection}\n\n             {isLastHole ? (`
);

replaceOnce(
  "settlement screen oecd section",
  `             {medalPrizeSection}\n             {nearSettlementSection}\n           </>`,
  `             {medalPrizeSection}\n             {nearSettlementSection}\n             {oecdSettlementSection}\n           </>`
);

replaceOnce(
  "final screen oecd section",
  `             {medalPrizeSection}\n             {nearSettlementSection}\n             {strokeSettlementSection}`, 
  `             {medalPrizeSection}\n             {nearSettlementSection}\n             {oecdSettlementSection}\n             {strokeSettlementSection}`
);

if (source === original) {
  console.log("No changes needed. OECD page patch was already applied.");
} else {
  writeFileSync(pagePath, source, "utf8");
  console.log("Applied OECD page patch to app/page.tsx");
}
