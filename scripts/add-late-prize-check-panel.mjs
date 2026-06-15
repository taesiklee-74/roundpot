#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "app/page.tsx");
let s = readFileSync(file, "utf8");
const before = s;

if (s.includes("종반전 제안 확인")) {
  console.log("check panel already exists");
  process.exit(0);
}

const panel = `
        {hasStarted && (roundView === "play" || roundView === "latest-result") && latePrizeBoostTargetHole && latePrizeBoostTargetHole.holeNumber >= 16 && latePrizeBoostTargetHole.holeNumber <= 18 && (
          <section className="rounded-2xl bg-fuchsia-50 p-4 text-sm shadow-sm">
            <h2 className="font-black text-fuchsia-950">종반전 제안 확인</h2>
            <p className="mt-2">대상 홀: {latePrizeBoostTargetHole.holeNumber}번</p>
            <p>표시 조건: {latePrizeBoostOffer?.shouldOffer ? "충족" : "미충족"}</p>
            <p>현재 총잔액: {formatPlainAmount(latePrizeBoostOffer?.currentTotalBalance ?? 0)}</p>
            <p>잔여 예상 지급액: {formatPlainAmount(latePrizeBoostOffer?.remainingExpectedPayout ?? 0)}</p>
            <p>초과분: {formatPlainAmount(latePrizeBoostOffer?.excessAmount ?? 0)}</p>
            <p>필요 초과분: {formatPlainAmount((latePrizeBoostOffer?.baseMainPrizeAmount ?? 0) * (latePrizeBoostOffer?.remainingHoleNumbers.length ?? 0))}</p>
            <p>거절한 홀: {latePrizeBoostDecision.declinedHoleNumbers.join(", ") || "없음"}</p>
          </section>
        )}
`;

const anchor = `        {showRoundHeader && (`;
const i = s.indexOf(anchor);
if (i === -1) {
  throw new Error("render anchor not found");
}

s = s.slice(0, i) + panel + s.slice(i);

if (s !== before) {
  writeFileSync(file, s, "utf8");
}

console.log("inserted late prize boost check panel");
