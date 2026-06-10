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

insertAfter(
  "OECD penalty unit helper",
  `function getOecdSettingsForSettlement(settings: BettingSettingsV2) {
  return {
    ...settings.oecd,
    penaltyDestination:
      settings.mode === "skins" ? settings.oecd.penaltyDestination : "commonPot",
  };
}
`,
  `
function getOecdPenaltyUnitAmount(settings: BettingSettingsV2): number {
  if (settings.mode === "skins") return settings.skins.amountPerHole;
  if (settings.mode === "vegas") return settings.vegas.amountPerHole;
  if (settings.mode === "hussein") return settings.hussein.amountPerHole;
  if (settings.mode === "school") return settings.school.firstPrizeAmount;
  if (settings.mode === "cycle") {
    return Math.max(
      1000,
      settings.cycle.skinsAmount,
      settings.cycle.husseinAmount,
      settings.cycle.vegasAmount
    );
  }

  return Math.max(1000, settings.stroke.amountPerStroke);
}
`,
  "function getOecdPenaltyUnitAmount(settings: BettingSettingsV2): number"
);

replaceOnce(
  "near-inclusive OECD entry fee block",
  `    const oecdEntryFeePerPlayer = (() => {
      if (settings.mode === "skins") return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount;
      if (settings.mode === "vegas") return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount;
      if (settings.mode === "hussein") return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount;
      if (settings.mode === "school") {
        return ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) / selectedPlayerCount;
      }
      if (settings.mode === "cycle") {
        return (settings.cycle.skinsAmount + settings.cycle.husseinAmount + settings.cycle.vegasAmount) / selectedPlayerCount;
      }
      return 0;
    })();`,
  `    const oecdEntryFeePerPlayer = (() => {
      const nearEntryFee = nearEnabled ? nearAmount : 0;

      if (settings.mode === "skins") {
        return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFee;
      }

      if (settings.mode === "vegas") {
        return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFee;
      }

      if (settings.mode === "hussein") {
        return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFee;
      }

      if (settings.mode === "school") {
        return (
          ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) /
          selectedPlayerCount +
          nearEntryFee
        );
      }

      if (settings.mode === "cycle") {
        return (
          (settings.cycle.skinsAmount +
            settings.cycle.husseinAmount +
            settings.cycle.vegasAmount) /
            selectedPlayerCount +
          nearEntryFee
        );
      }

      return nearEntryFee;
    })();`
);

replaceOnce(
  "near-inclusive OECD entry fee block verbose",
  `    const oecdEntryFeePerPlayer = (() => {
      if (settings.mode === "skins") {
        return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount;
      }

      if (settings.mode === "vegas") {
        return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount;
      }

      if (settings.mode === "hussein") {
        return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount;
      }

      if (settings.mode === "school") {
        return (
          ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) /
          selectedPlayerCount
        );
      }

      if (settings.mode === "cycle") {
        return (
          (settings.cycle.skinsAmount +
            settings.cycle.husseinAmount +
            settings.cycle.vegasAmount) /
          selectedPlayerCount
        );
      }

      return 0;
    })();`,
  `    const oecdEntryFeePerPlayer = (() => {
      const nearEntryFee = nearEnabled ? nearAmount : 0;

      if (settings.mode === "skins") {
        return (settings.skins.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFee;
      }

      if (settings.mode === "vegas") {
        return (settings.vegas.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFee;
      }

      if (settings.mode === "hussein") {
        return (settings.hussein.amountPerHole * holeCount) / selectedPlayerCount + nearEntryFee;
      }

      if (settings.mode === "school") {
        return (
          ((settings.school.firstPrizeAmount + settings.school.secondPrizeAmount) * holeCount) /
          selectedPlayerCount +
          nearEntryFee
        );
      }

      if (settings.mode === "cycle") {
        return (
          (settings.cycle.skinsAmount +
            settings.cycle.husseinAmount +
            settings.cycle.vegasAmount) /
            selectedPlayerCount +
          nearEntryFee
        );
      }

      return nearEntryFee;
    })();`
);

replaceOnce(
  "OecdPenaltyInputSection unit prop",
  `            penalties={oecdPenalties}
            formatPlainAmount={formatPlainAmount}`,
  `            penalties={oecdPenalties}
            penaltyUnitAmount={getOecdPenaltyUnitAmount(settings)}
            formatPlainAmount={formatPlainAmount}`
);

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} step(s).`);
if (skipped.length > 0) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
