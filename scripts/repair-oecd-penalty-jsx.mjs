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

function removePenaltyBlocks() {
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

function findNearConditionalEnd() {
  const nearIndex = source.indexOf("<NearWinnerSelector");
  if (nearIndex === -1) {
    return -1;
  }

  const componentEnd = source.indexOf("/>", nearIndex);
  if (componentEnd === -1) {
    return -1;
  }

  const afterComponent = componentEnd + 2;

  const conditionalEndCandidates = [
    "\n          )}",
    "\n        )}",
    "\n      )}",
  ];

  let bestIndex = -1;
  let bestToken = "";

  for (const token of conditionalEndCandidates) {
    const index = source.indexOf(token, afterComponent);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
      bestToken = token;
    }
  }

  if (bestIndex === -1) {
    return afterComponent;
  }

  return bestIndex + bestToken.length;
}

const removed = removePenaltyBlocks();
const insertAt = findNearConditionalEnd();

if (insertAt === -1) {
  throw new Error("Could not find NearWinnerSelector conditional block");
}

source = source.slice(0, insertAt) + penaltyBlock + source.slice(insertAt);

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Removed ${removed} misplaced OECD penalty section(s).`);
console.log("Inserted OECD penalty section after NearWinnerSelector conditional block.");
