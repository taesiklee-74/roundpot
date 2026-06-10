#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;

const penaltyBlock = `

          <OecdPenaltyInputSection
            enabled={settings.oecd.enabled}
            hole={currentHole}
            players={players}
            statuses={currentOecdStatuses}
            penalties={oecdPenalties}
            formatPlainAmount={formatPlainAmount}
            onChangePenalty={updateOecdPenalty}
          />`;

function removeAllPenaltyBlocks() {
  let count = 0;
  source = source.replace(
    /\n\s*<OecdPenaltyInputSection\n[\s\S]*?\n\s*\/>(?=\n)/g,
    () => {
      count += 1;
      return "";
    }
  );
  return count;
}

function insertAfterScoreList() {
  const playScoreAnchor = `          </div>

          {settings.mode === "vegas" &&`;

  if (source.includes(penaltyBlock.trim())) {
    return false;
  }

  const index = source.indexOf(playScoreAnchor);
  if (index === -1) {
    throw new Error("Could not find current-hole score section anchor");
  }

  const insertAt = index + "          </div>".length;
  source = source.slice(0, insertAt) + penaltyBlock + source.slice(insertAt);
  return true;
}

const removed = removeAllPenaltyBlocks();
const inserted = insertAfterScoreList();

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Removed ${removed} OECD penalty input section(s).`);
console.log(inserted
  ? "Inserted OECD penalty input under current-hole score list."
  : "OECD penalty input was already in the target position.");
