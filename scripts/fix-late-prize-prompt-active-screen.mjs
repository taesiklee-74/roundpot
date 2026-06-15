#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "app/page.tsx");
let s = readFileSync(file, "utf8");
const before = s;

let removed = 0;
s = s.replace(
  /\n\s*<LatePrizeBoostPrompt\n[\s\S]*?\n\s*\/>(?=\n)/g,
  () => {
    removed += 1;
    return "";
  }
);

const prompt = `
        <LatePrizeBoostPrompt
          offer={
            hasStarted && (roundView === "play" || roundView === "latest-result")
              ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer
              : null
          }
          formatPlainAmount={formatPlainAmount}
          onAccept={acceptLatePrizeBoost}
          onDecline={declineLatePrizeBoost}
        />
`;

if (s.includes("<LatePrizeBoostPrompt")) {
  console.log(`Removed ${removed} existing prompt block(s).`);
  console.log("Prompt already exists after cleanup, no insertion needed.");
} else {
  const debugAnchor = `        {hasStarted && (roundView === "play" || roundView === "latest-result") && latePrizeBoostTargetHole`;
  const headerAnchor = `        {showRoundHeader && (`;
  const anchor = s.includes(debugAnchor) ? debugAnchor : headerAnchor;
  const i = s.indexOf(anchor);

  if (i === -1) {
    throw new Error("Could not find active round render anchor");
  }

  s = s.slice(0, i) + prompt + s.slice(i);
  console.log(`Removed ${removed} existing prompt block(s).`);
  console.log("Inserted prompt in active round screen.");
}

if (s !== before) {
  writeFileSync(file, s, "utf8");
}
