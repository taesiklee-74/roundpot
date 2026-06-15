#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;
const applied = [];
const skipped = [];

function replaceExact(label, search, replacement) {
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

replaceExact(
  "import LatePrizeBoostOffer type",
  `  normalizeLatePrizeBoostDecision,\n  type LatePrizeBoostDecision,`,
  `  normalizeLatePrizeBoostDecision,\n  type LatePrizeBoostDecision,\n  type LatePrizeBoostOffer,`
);

insertAfter(
  "pending late prize offer state",
  `  const [latePrizeBoostDecision, setLatePrizeBoostDecision] =\n    useState<LatePrizeBoostDecision>(() => createDefaultLatePrizeBoostDecision());`,
  `\n  const [pendingLatePrizeBoostOffer, setPendingLatePrizeBoostOffer] =\n    useState<LatePrizeBoostOffer | null>(null);`,
  `pendingLatePrizeBoostOffer`
);

// Use the first incomplete hole as the target. This is safer than currentHole + 1 because
// currentHoleIndex can differ by view timing.
const targetMemoStart = source.indexOf(`  const latePrizeBoostTargetHole = useMemo(() => {`);
if (targetMemoStart === -1) {
  skipped.push("replace late prize target memo: missing start anchor");
} else if (source.includes(`const firstIncompleteHoleIndex = getFirstIncompleteHoleIndex(`)) {
  skipped.push("replace late prize target memo: already applied");
} else {
  const targetMemoEndMarker = `  }, [currentHole, holes, roundView]);`;
  const targetMemoEnd = source.indexOf(targetMemoEndMarker, targetMemoStart);

  if (targetMemoEnd === -1) {
    skipped.push("replace late prize target memo: missing end anchor");
  } else {
    const replacement = `  const latePrizeBoostTargetHole = useMemo(() => {\n    if (!currentHole) return null;\n\n    const firstIncompleteHoleIndex = getFirstIncompleteHoleIndex(\n      players,\n      holes,\n      scores\n    );\n\n    if (firstIncompleteHoleIndex !== null) {\n      return holes[firstIncompleteHoleIndex] ?? currentHole;\n    }\n\n    return currentHole;\n  }, [currentHole, holes, players, scores]);`;
    source =
      source.slice(0, targetMemoStart) +
      replacement +
      source.slice(targetMemoEnd + targetMemoEndMarker.length);
    applied.push("replace late prize target memo");
  }
}

insertAfter(
  "pending offer effect",
  `  const latePrizeBoostOffer = useMemo(() => {`,
  ``,
  `const pendingLatePrizeBoostOffer =`
);

insertBefore(
  "pending offer effect after memo",
  `  function updatePlayerName(index: number, value: string) {`,
  `  useEffect(() => {\n    if (!latePrizeBoostOffer?.shouldOffer) {\n      return;\n    }\n\n    setPendingLatePrizeBoostOffer((prev) => {\n      if (\n        prev?.holeNumber === latePrizeBoostOffer.holeNumber &&\n        prev.excessAmount === latePrizeBoostOffer.excessAmount &&\n        prev.remainingExpectedPayout === latePrizeBoostOffer.remainingExpectedPayout\n      ) {\n        return prev;\n      }\n\n      return latePrizeBoostOffer;\n    });\n  }, [latePrizeBoostOffer]);\n\n`,
  `setPendingLatePrizeBoostOffer((prev) =>`
);

replaceExact(
  "accept handler uses pending offer",
  `function acceptLatePrizeBoost() {\n  if (!latePrizeBoostOffer?.shouldOffer) return;\n\n  setLatePrizeBoostDecision((prev) =>\n    acceptLatePrizeBoostOffer({\n      decision: prev,\n      offer: latePrizeBoostOffer,\n    })\n  );\n}`,
  `function acceptLatePrizeBoost() {\n  const offer = pendingLatePrizeBoostOffer ?? latePrizeBoostOffer;\n  if (!offer?.shouldOffer) return;\n\n  setLatePrizeBoostDecision((prev) =>\n    acceptLatePrizeBoostOffer({\n      decision: prev,\n      offer,\n    })\n  );\n  setPendingLatePrizeBoostOffer(null);\n}`
);

replaceExact(
  "decline handler uses pending offer",
  `function declineLatePrizeBoost() {\n  if (!latePrizeBoostOffer) return;\n\n  setLatePrizeBoostDecision((prev) =>\n    declineLatePrizeBoostOffer(prev, latePrizeBoostOffer.holeNumber)\n  );\n}`,
  `function declineLatePrizeBoost() {\n  const offer = pendingLatePrizeBoostOffer ?? latePrizeBoostOffer;\n  if (!offer) return;\n\n  setLatePrizeBoostDecision((prev) =>\n    declineLatePrizeBoostOffer(prev, offer.holeNumber)\n  );\n  setPendingLatePrizeBoostOffer(null);\n}`
);

replaceExact(
  "prompt uses pending offer",
  `        offer={roundView === "play" || roundView === "latest-result" ? latePrizeBoostOffer : null}`,
  `        offer={\n          roundView === "play" || roundView === "latest-result"\n            ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer\n            : null\n        }`
);

replaceExact(
  "reset clears pending offer",
  `setLatePrizeBoostDecision(createDefaultLatePrizeBoostDecision());`,
  `setLatePrizeBoostDecision(createDefaultLatePrizeBoostDecision());\n    setPendingLatePrizeBoostOffer(null);`
);

if (source !== original) {
  writeFileSync(pagePath, source, "utf8");
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length > 0) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length > 0) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
