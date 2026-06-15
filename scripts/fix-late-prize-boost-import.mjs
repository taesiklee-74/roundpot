#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pagePath = resolve(process.cwd(), "app/page.tsx");
let source = readFileSync(pagePath, "utf8");
const original = source;

if (source.includes('import LatePrizeBoostPrompt from "./components/LatePrizeBoostPrompt";')) {
  console.log("LatePrizeBoostPrompt import already exists.");
  process.exit(0);
}

const importLine = 'import LatePrizeBoostPrompt from "./components/LatePrizeBoostPrompt";\n';
const anchors = [
  'import OecdSettingsCard from "./components/OecdSettingsCard";\n',
  'import OecdPenaltyInputSection from "./components/OecdPenaltyInputSection";\n',
  'import NearWinnerSelector from "./components/NearWinnerSelector";\n',
  'import LatestResultSection from "./components/LatestResultSection";\n',
];

let inserted = false;
for (const anchor of anchors) {
  const index = source.indexOf(anchor);
  if (index !== -1) {
    source = source.slice(0, index + anchor.length) + importLine + source.slice(index + anchor.length);
    inserted = true;
    break;
  }
}

if (!inserted) {
  throw new Error("Could not find a component import anchor for LatePrizeBoostPrompt");
}

writeFileSync(pagePath, source, "utf8");
console.log("Inserted LatePrizeBoostPrompt import.");
