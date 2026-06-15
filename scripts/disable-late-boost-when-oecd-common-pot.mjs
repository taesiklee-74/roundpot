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

replace(
  "late boost offer blocked by OECD common pot",
  `  const latePrizeBoostOffer = useMemo(() => {
    if (!latePrizeBoostTargetHole || !activeCalculation?.gameResult) return null;`,
  `  const latePrizeBoostOffer = useMemo(() => {
    if (!latePrizeBoostTargetHole || !activeCalculation?.gameResult) return null;
    if (oecdCommonPotForBalance > 0) return null;`
);

replace(
  "late boost offer deps include OECD common pot",
  `    oecdSettlementSummary.commonPotAmount,
    settings,`,
  `    oecdSettlementSummary.commonPotAmount,
    oecdCommonPotForBalance,
    settings,`
);

replace(
  "pending offer cleared by OECD common pot",
  `      !hasStarted ||
      roundView !== "play" ||
      !latePrizeBoostOffer?.shouldOffer`,
  `      !hasStarted ||
      roundView !== "play" ||
      oecdCommonPotForBalance > 0 ||
      !latePrizeBoostOffer?.shouldOffer`
);

replace(
  "pending offer deps include OECD common pot",
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
