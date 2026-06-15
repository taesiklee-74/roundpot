#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "app/page.tsx");
let s = readFileSync(file, "utf8");
const before = s;
const applied = [];
const skipped = [];

function replace(label, from, to) {
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

// The first script may fail to block latePrizeBoostOffer itself because local page.tsx
// has moved. This guard blocks the actual prompt prop, which is the user-visible path.
replace(
  "prompt hidden when OECD common pot exists",
  `hasStarted && roundView === "play"
            ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer
            : null`,
  `hasStarted && roundView === "play" && oecdCommonPotForBalance <= 0
            ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer
            : null`
);

replace(
  "clear pending when accepting cannot happen with common pot",
  `function acceptLatePrizeBoost() {
  const offer = pendingLatePrizeBoostOffer ?? latePrizeBoostOffer;
  if (!offer?.shouldOffer) return;`,
  `function acceptLatePrizeBoost() {
  const offer = pendingLatePrizeBoostOffer ?? latePrizeBoostOffer;
  if (oecdCommonPotForBalance > 0) return;
  if (!offer?.shouldOffer) return;`
);

// Keep this idempotent; if the first script already patched the effect/deps, these skip.
replace(
  "pending offer clears with common pot fallback",
  `      !hasStarted ||
      roundView !== "play" ||
      !latePrizeBoostOffer?.shouldOffer`,
  `      !hasStarted ||
      roundView !== "play" ||
      oecdCommonPotForBalance > 0 ||
      !latePrizeBoostOffer?.shouldOffer`
);

replace(
  "pending effect deps common pot fallback",
  `  }, [hasStarted, roundView, latePrizeBoostOffer]);`,
  `  }, [hasStarted, roundView, oecdCommonPotForBalance, latePrizeBoostOffer]);`
);

if (s !== before) {
  writeFileSync(file, s, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((x) => `  + ${x}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((x) => `  - ${x}`).join("\n"));
