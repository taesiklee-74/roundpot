#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;
const applied = [];
const skipped = [];

function patch(label, from, to) {
  if (source.includes(to)) {
    skipped.push(`${label}: already applied`);
    return;
  }
  if (!source.includes(from)) {
    skipped.push(`${label}: missing anchor`);
    return;
  }
  source = source.replace(from, to);
  applied.push(label);
}

patch(
  "no target after all holes complete",
  `    if (firstIncompleteHoleIndex !== null) {
      return holes[firstIncompleteHoleIndex] ?? currentHole;
    }

    return currentHole;
  }, [currentHole, holes, players, scores]);`,
  `    if (firstIncompleteHoleIndex !== null) {
      return holes[firstIncompleteHoleIndex] ?? null;
    }

    return null;
  }, [currentHole, holes, players, scores]);`
);

patch(
  "pending offer only in active views",
  `  useEffect(() => {
    if (!latePrizeBoostOffer?.shouldOffer) {
      return;
    }

    setPendingLatePrizeBoostOffer((prev) => {`,
  `  useEffect(() => {
    if (
      !hasStarted ||
      (roundView !== "play" && roundView !== "latest-result") ||
      !latePrizeBoostOffer?.shouldOffer
    ) {
      setPendingLatePrizeBoostOffer(null);
      return;
    }

    setPendingLatePrizeBoostOffer((prev) => {`
);

patch(
  "pending offer effect dependencies",
  `  }, [latePrizeBoostOffer]);`,
  `  }, [hasStarted, roundView, latePrizeBoostOffer]);`
);

patch(
  "prompt needs active round",
  `        offer={
          roundView === "play" || roundView === "latest-result"
            ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer
            : null
        }`,
  `        offer={
          hasStarted && (roundView === "play" || roundView === "latest-result")
            ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer
            : null
        }`
);

patch(
  "reset clears pending offer",
  `setLatePrizeBoostDecision(createDefaultLatePrizeBoostDecision());`,
  `setLatePrizeBoostDecision(createDefaultLatePrizeBoostDecision());
    setPendingLatePrizeBoostOffer(null);`
);

if (!source.includes(`setPendingLatePrizeBoostOffer(null);
    setHasStarted(false);`) && source.includes(`setHasStarted(false);`)) {
  source = source.replace(`setHasStarted(false);`, `setPendingLatePrizeBoostOffer(null);
    setHasStarted(false);`);
  applied.push("clear pending before returning setup");
} else {
  skipped.push("clear pending before returning setup: already applied or missing anchor");
}

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
