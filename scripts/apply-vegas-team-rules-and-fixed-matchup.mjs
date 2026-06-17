#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const applied = [];
const skipped = [];

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function write(path, value) {
  writeFileSync(resolve(root, path), value, "utf8");
}

function replace(path, label, from, to) {
  let s = read(path);
  if (s.includes(to)) {
    skipped.push(`${label}: already applied`);
    return;
  }
  if (!s.includes(from)) {
    skipped.push(`${label}: missing anchor`);
    return;
  }
  s = s.replace(from, to);
  write(path, s);
  applied.push(label);
}

replace(
  "src/lib/betting/types.ts",
  "add fixedMatchup team mode type",
  `export type VegasTeamMode =\n  | "randomAfterHole"\n  | "previousRanks";`,
  `export type VegasTeamMode =\n  | "randomAfterHole"\n  | "previousRanks"\n  | "fixedMatchup";`
);

{
  const path = "src/lib/betting/vegas.ts";
  let s = read(path);
  const before = s;

  const start = s.indexOf("function createPreviousRanksTeamAssignmentFromStandings(params:");
  const end = s.indexOf("function getPreviousHole", start);
  if (start === -1 || end === -1) {
    skipped.push("replace previous-rank partial tie resolver: missing anchor");
  } else if (s.includes("1등-하위 동률 부분 랜덤")) {
    skipped.push("replace previous-rank partial tie resolver: already applied");
  } else {
    const nextFunction = `function withoutPicked(\n  standings: PlayerHoleStanding[],\n  picked: PlayerHoleStanding[]\n): PlayerHoleStanding[] {\n  const pickedIds = new Set(picked.map((standing) => standing.player.id));\n  return standings.filter((standing) => !pickedIds.has(standing.player.id));\n}\n\nfunction createPreviousRanksTeamAssignmentFromStandings(params: {\n  hole: Hole;\n  previousHole: Hole;\n  players: Player[];\n  standings: PlayerHoleStanding[];\n}): TeamAssignment {\n  const { hole, previousHole, players, standings } = params;\n\n  const groups = new Map<number, PlayerHoleStanding[]>();\n\n  for (const standing of standings) {\n    const current = groups.get(standing.strokes) ?? [];\n    current.push(standing);\n    groups.set(standing.strokes, current);\n  }\n\n  const scoreGroups = Array.from(groups.entries())\n    .sort(([scoreA], [scoreB]) => scoreA - scoreB)\n    .map(([, group]) => group);\n\n  const groupSizes = scoreGroups.map((group) => group.length).join("-");\n  const reason = \`전홀 \${previousHole.holeNumber}번 홀 1·4등 vs 2·3등\`;\n\n  if (groupSizes === "1-1-1-1") {\n    return createTeamsFromPlayerIds(\n      hole,\n      [standings[0].player.id, standings[3].player.id],\n      [standings[1].player.id, standings[2].player.id],\n      reason\n    );\n  }\n\n  if (groupSizes === "2-1-1") {\n    const selectedFirst = pickSeededPlayer(scoreGroups[0], \`vegas-tied-first:\${previousHole.id}:\${hole.id}\`);\n    const otherFirst = withoutPicked(scoreGroups[0], [selectedFirst])[0];\n\n    if (!otherFirst) return createRandomTeamAssignment(hole, players, \`vegas-invalid-tied-first-\${previousHole.id}\`);\n\n    return createTeamsFromPlayerIds(\n      hole,\n      [selectedFirst.player.id, scoreGroups[1][0].player.id],\n      [otherFirst.player.id, scoreGroups[2][0].player.id],\n      \`${reason} · 1등 동률 부분 랜덤\`\n    );\n  }\n\n  if (groupSizes === "2-2") {\n    const selectedFirst = pickSeededPlayer(scoreGroups[0], \`vegas-tied-first-pair:\${previousHole.id}:\${hole.id}\`);\n    const selectedLower = pickSeededPlayer(scoreGroups[1], \`vegas-tied-lower-pair:\${previousHole.id}:\${hole.id}\`);\n    const otherFirst = withoutPicked(scoreGroups[0], [selectedFirst])[0];\n    const otherLower = withoutPicked(scoreGroups[1], [selectedLower])[0];\n\n    if (!otherFirst || !otherLower) return createRandomTeamAssignment(hole, players, \`vegas-invalid-two-pairs-\${previousHole.id}\`);\n\n    return createTeamsFromPlayerIds(\n      hole,\n      [selectedFirst.player.id, selectedLower.player.id],\n      [otherFirst.player.id, otherLower.player.id],\n      \`${reason} · 1등-하위 동률 부분 랜덤\`\n    );\n  }\n\n  if (groupSizes === "3-1") {\n    const selectedFirst = pickSeededPlayer(scoreGroups[0], \`vegas-three-tied-first:\${previousHole.id}:\${hole.id}\`);\n    const otherFirsts = withoutPicked(scoreGroups[0], [selectedFirst]);\n\n    if (otherFirsts.length !== 2) return createRandomTeamAssignment(hole, players, \`vegas-invalid-three-first-\${previousHole.id}\`);\n\n    return createTeamsFromPlayerIds(\n      hole,\n      [selectedFirst.player.id, scoreGroups[1][0].player.id],\n      [otherFirsts[0].player.id, otherFirsts[1].player.id],\n      \`${reason} · 1등 3명 동률 부분 랜덤\`\n    );\n  }\n\n  if (groupSizes === "1-2-1") {\n    return createTeamsFromPlayerIds(\n      hole,\n      [scoreGroups[0][0].player.id, scoreGroups[2][0].player.id],\n      [scoreGroups[1][0].player.id, scoreGroups[1][1].player.id],\n      \`${reason} · 2등 동률\`\n    );\n  }\n\n  if (groupSizes === "1-3") {\n    const selectedSecond = pickSeededPlayer(scoreGroups[1], \`vegas-three-tied-second:\${previousHole.id}:\${hole.id}\`);\n    const otherSeconds = withoutPicked(scoreGroups[1], [selectedSecond]);\n\n    if (otherSeconds.length !== 2) return createRandomTeamAssignment(hole, players, \`vegas-invalid-three-second-\${previousHole.id}\`);\n\n    return createTeamsFromPlayerIds(\n      hole,\n      [scoreGroups[0][0].player.id, selectedSecond.player.id],\n      [otherSeconds[0].player.id, otherSeconds[1].player.id],\n      \`${reason} · 2등 3명 동률 부분 랜덤\`\n    );\n  }\n\n  if (groupSizes === "1-1-2") {\n    const selectedThird = pickSeededPlayer(scoreGroups[2], \`vegas-tied-third:\${previousHole.id}:\${hole.id}\`);\n    const otherThird = withoutPicked(scoreGroups[2], [selectedThird])[0];\n\n    if (!otherThird) return createRandomTeamAssignment(hole, players, \`vegas-invalid-tied-third-\${previousHole.id}\`);\n\n    return createTeamsFromPlayerIds(\n      hole,\n      [scoreGroups[0][0].player.id, selectedThird.player.id],\n      [scoreGroups[1][0].player.id, otherThird.player.id],\n      \`${reason} · 3등 동률 부분 랜덤\`\n    );\n  }\n\n  if (groupSizes === "4") {\n    return createRandomTeamAssignment(hole, players, \`vegas-all-tied-previous-hole-\${previousHole.id}\`);\n  }\n\n  return createRandomTeamAssignment(\n    hole,\n    players,\n    \`vegas-unresolved-tie-previous-hole-\${previousHole.id}\`\n  );\n}\n\n`;
    s = s.slice(0, start) + nextFunction + s.slice(end);
    applied.push("replace previous-rank partial tie resolver");
  }

  if (!s.includes("function cloneTeamAssignmentToHole(")) {
    const anchor = "export function createVegasTeamAssignment(params:";
    const idx = s.indexOf(anchor);
    if (idx === -1) {
      skipped.push("add fixed matchup helpers: missing anchor");
    } else {
      const helper = `function cloneTeamAssignmentToHole(assignment: TeamAssignment, hole: Hole, reason: string): TeamAssignment {\n  return {\n    holeId: hole.id,\n    holeNumber: hole.holeNumber,\n    teams: assignment.teams.map((team) => ({\n      ...team,\n      playerIds: [...team.playerIds],\n    })) as [Team, Team],\n    reason,\n  };\n}\n\nfunction getFirstStoredVegasAssignment(teamAssignments: TeamAssignment[] | undefined): TeamAssignment | null {\n  return (teamAssignments ?? [])\n    .slice()\n    .sort((a, b) => a.holeNumber - b.holeNumber)\n    .find((assignment) => assignment.teams.length === 2) ?? null;\n}\n\nfunction createFixedMatchupTeamAssignment(\n  hole: Hole,\n  players: Player[],\n  teamAssignments: TeamAssignment[] | undefined\n): TeamAssignment {\n  const firstAssignment = getFirstStoredVegasAssignment(teamAssignments);\n\n  if (firstAssignment) {\n    return cloneTeamAssignmentToHole(\n      firstAssignment,\n      hole,\n      `맞수 팀 대결 · ${firstAssignment.holeNumber}번 홀 팀 유지`\n    );\n  }\n\n  return createRandomTeamAssignment(hole, players, "vegas-fixed-matchup-fallback");\n}\n\n`;
      s = s.slice(0, idx) + helper + s.slice(idx);
      applied.push("add fixed matchup helpers");
    }
  } else {
    skipped.push("add fixed matchup helpers: already applied");
  }

  replaceInVegas("createVegasTeamAssignment fixed branch", `  if (settings.teamMode === "previousRanks") {\n    return createPreviousRanksTeamAssignment(hole, players, holes, scores);\n  }`, `  if (settings.teamMode === "fixedMatchup") {\n    return createFixedMatchupTeamAssignment(hole, players, teamAssignments);\n  }\n\n  if (settings.teamMode === "previousRanks") {\n    return createPreviousRanksTeamAssignment(hole, players, holes, scores);\n  }`);

  replaceInVegas("preview fixed matchup branch", `  if (settings.teamAssignmentMode === "manual") {`, `  if (settings.teamMode === "fixedMatchup") {\n    const fixedAssignment =\n      storedAssignment ??\n      (getFirstStoredVegasAssignment(teamAssignments)\n        ? createFixedMatchupTeamAssignment(nextHole, players, teamAssignments)\n        : null);\n\n    return {\n      holeId: nextHole.id,\n      holeNumber: nextHole.holeNumber,\n      gameType: "vegas",\n      title: `${nextHole.holeNumber}번 홀 라스베가스`,\n      description:\n        carriedIn > 0\n          ? `이월 ${carriedIn.toLocaleString()}원 포함. 맞수 팀 대결로 같은 팀 구성을 유지합니다.`\n          : "맞수 팀 대결로 같은 팀 구성을 유지합니다.",\n      baseAmount,\n      carriedIn,\n      prizeAmount,\n      teams: fixedAssignment?.teams,\n    };\n  }\n\n  if (settings.teamAssignmentMode === "manual") {`);

  function replaceInVegas(label, from, to) {
    if (s.includes(to)) {
      skipped.push(`${label}: already applied`);
    } else if (s.includes(from)) {
      s = s.replace(from, to);
      applied.push(label);
    } else {
      skipped.push(`${label}: missing anchor`);
    }
  }

  if (s !== before) write(path, s);
}

{
  const path = "app/page.tsx";
  let s = read(path);
  const before = s;

  if (!s.includes('key: "fixedMatchup"')) {
    const optionAnchor = `                    {\n                      key: "manualAfterHole",\n                      label: "홀 종료 후 직접 입력",`;
    const optionInsert = `                    {\n                      key: "fixedMatchup",\n                      label: "맞수 팀 대결",\n                      teamMode: "fixedMatchup" as const,\n                      teamAssignmentMode: "auto" as const,\n                    },\n`;
    if (s.includes(optionAnchor)) {
      s = s.replace(optionAnchor, optionInsert + optionAnchor);
      applied.push("add fixed matchup setting option");
    } else {
      skipped.push("add fixed matchup setting option: missing anchor");
    }
  } else {
    skipped.push("add fixed matchup setting option: already applied");
  }

  if (!s.includes('settings.vegas.teamMode === "fixedMatchup"') || !s.includes('맞수 팀 선택')) {
    const re = /const shouldManuallySelectFirstVegasTeams\s*=\s*[\s\S]*?;/;
    const replacement = `const shouldManuallySelectFirstVegasTeams =\n    settings.mode === "vegas" &&\n    currentHole?.holeNumber === 1 &&\n    (settings.vegas.teamMode === "previousRanks" ||\n      settings.vegas.teamMode === "fixedMatchup") &&\n    !vegasTeamAssignments.some((assignment) => assignment.holeId === currentHole.id);`;
    if (re.test(s)) {
      s = s.replace(re, replacement);
      applied.push("require first-hole team selection for fixed matchup");
    } else {
      skipped.push("require first-hole team selection for fixed matchup: missing anchor");
    }
  } else {
    skipped.push("require first-hole team selection for fixed matchup: already applied");
  }

  const titleFrom = `{shouldManuallySelectFirstVegasTeams\n                    ? "1번 홀 팀 선택"\n                    : "이번 홀 팀 직접 입력"}`;
  const titleTo = `{settings.vegas.teamMode === "fixedMatchup"\n                    ? "맞수 팀 선택"\n                    : shouldManuallySelectFirstVegasTeams\n                      ? "1번 홀 팀 선택"\n                      : "이번 홀 팀 직접 입력"}`;
  if (s.includes(titleTo)) {
    skipped.push("manual Vegas card title for fixed matchup: already applied");
  } else if (s.includes(titleFrom)) {
    s = s.replace(titleFrom, titleTo);
    applied.push("manual Vegas card title for fixed matchup");
  } else {
    skipped.push("manual Vegas card title for fixed matchup: missing anchor");
  }

  const helpFrom = `{shouldManuallySelectFirstVegasTeams\n                    ? "1번 홀 팀을 직접 선택하세요. 팀 A 2명을 선택하면 나머지 2명은 팀 B가 됩니다."\n                    : "팀 A 2명을 선택하세요. 나머지 2명은 팀 B가 됩니다."}`;
  const helpTo = `{settings.vegas.teamMode === "fixedMatchup"\n                    ? "1번 홀에서 맞수 팀을 선택하세요. 이 팀 구성이 라운드 종료까지 유지됩니다."\n                    : shouldManuallySelectFirstVegasTeams\n                      ? "1번 홀 팀을 직접 선택하세요. 팀 A 2명을 선택하면 나머지 2명은 팀 B가 됩니다."\n                      : "팀 A 2명을 선택하세요. 나머지 2명은 팀 B가 됩니다."}`;
  if (s.includes(helpTo)) {
    skipped.push("manual Vegas card help for fixed matchup: already applied");
  } else if (s.includes(helpFrom)) {
    s = s.replace(helpFrom, helpTo);
    applied.push("manual Vegas card help for fixed matchup");
  } else {
    skipped.push("manual Vegas card help for fixed matchup: missing anchor");
  }

  if (s !== before) write(path, s);
}

console.log(`Applied ${applied.length} patch step(s).`);
if (applied.length) console.log(applied.map((item) => `  + ${item}`).join("\n"));
console.log(`Skipped ${skipped.length} patch step(s).`);
if (skipped.length) console.log(skipped.map((item) => `  - ${item}`).join("\n"));
