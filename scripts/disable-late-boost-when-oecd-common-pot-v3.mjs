#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "app/page.tsx");
let s = readFileSync(file, "utf8");
const before = s;

const promptStart = s.indexOf("<LatePrizeBoostPrompt");
if (promptStart === -1) {
  throw new Error("LatePrizeBoostPrompt block not found");
}

const promptEnd = s.indexOf("/>", promptStart);
if (promptEnd === -1) {
  throw new Error("LatePrizeBoostPrompt block end not found");
}

const block = s.slice(promptStart, promptEnd + 2);
const offerStart = block.indexOf("offer={");
if (offerStart === -1) {
  throw new Error("LatePrizeBoostPrompt offer prop not found");
}

const afterOfferStart = offerStart + "offer={".length;
const formatProp = block.indexOf("formatPlainAmount=", afterOfferStart);
if (formatProp === -1) {
  throw new Error("formatPlainAmount prop after offer not found");
}

const beforeOffer = block.slice(0, offerStart);
const afterOffer = block.slice(formatProp);
const guardedOffer = [
  "offer={",
  "          hasStarted && roundView === \"play\" && oecdCommonPotForBalance <= 0",
  "            ? pendingLatePrizeBoostOffer ?? latePrizeBoostOffer",
  "            : null",
  "        }\n          "
].join("\n");

const newBlock = beforeOffer + guardedOffer + afterOffer;
s = s.slice(0, promptStart) + newBlock + s.slice(promptEnd + 2);

if (!s.includes("oecdCommonPotForBalance <= 0")) {
  throw new Error("Guard was not inserted");
}

if (s !== before) {
  writeFileSync(file, s, "utf8");
  console.log("Patched LatePrizeBoostPrompt offer guard.");
} else {
  console.log("No changes made.");
}
