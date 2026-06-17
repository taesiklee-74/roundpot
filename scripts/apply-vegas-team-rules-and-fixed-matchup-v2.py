from pathlib import Path
import re

applied = []
skipped = []

def replace_file(path, label, old, new):
    p = Path(path)
    s = p.read_text()
    if new in s:
        skipped.append(f"{label}: already applied")
        return
    if old not in s:
        skipped.append(f"{label}: missing anchor")
        return
    p.write_text(s.replace(old, new))
    applied.append(label)

replace_file(
    "src/lib/betting/types.ts",
    "add fixedMatchup team mode type",
    'export type VegasTeamMode =\n  | "randomAfterHole"\n  | "previousRanks";',
    'export type VegasTeamMode =\n  | "randomAfterHole"\n  | "previousRanks"\n  | "fixedMatchup";',
)

# src/lib/betting/vegas.ts
path = Path("src/lib/betting/vegas.ts")
s = path.read_text()
before = s

start = s.find("function createPreviousRanksTeamAssignmentFromStandings(params:")
end = s.find("function getPreviousHole", start)

if start == -1 or end == -1:
    skipped.append("replace previous-rank partial tie resolver: missing anchor")
elif "1등-하위 동률 부분 랜덤" in s:
    skipped.append("replace previous-rank partial tie resolver: already applied")
else:
    new_func = '''function withoutPicked(
  standings: PlayerHoleStanding[],
  picked: PlayerHoleStanding[]
): PlayerHoleStanding[] {
  const pickedIds = new Set(picked.map((standing) => standing.player.id));
  return standings.filter((standing) => !pickedIds.has(standing.player.id));
}

function createPreviousRanksTeamAssignmentFromStandings(params: {
  hole: Hole;
  previousHole: Hole;
  players: Player[];
  standings: PlayerHoleStanding[];
}): TeamAssignment {
  const { hole, previousHole, players, standings } = params;

  const groups = new Map<number, PlayerHoleStanding[]>();

  for (const standing of standings) {
    const current = groups.get(standing.strokes) ?? [];
    current.push(standing);
    groups.set(standing.strokes, current);
  }

  const scoreGroups = Array.from(groups.entries())
    .sort(([scoreA], [scoreB]) => scoreA - scoreB)
    .map(([, group]) => group);

  const groupSizes = scoreGroups.map((group) => group.length).join("-");
  const reason = `전홀 ${previousHole.holeNumber}번 홀 1·4등 vs 2·3등`;

  if (groupSizes === "1-1-1-1") {
    return createTeamsFromPlayerIds(
      hole,
      [standings[0].player.id, standings[3].player.id],
      [standings[1].player.id, standings[2].player.id],
      reason
    );
  }

  if (groupSizes === "2-1-1") {
    const selectedFirst = pickSeededPlayer(
      scoreGroups[0],
      `vegas-tied-first:${previousHole.id}:${hole.id}`
    );
    const otherFirst = withoutPicked(scoreGroups[0], [selectedFirst])[0];

    if (!otherFirst) {
      return createRandomTeamAssignment(hole, players, `vegas-invalid-tied-first-${previousHole.id}`);
    }

    return createTeamsFromPlayerIds(
      hole,
      [selectedFirst.player.id, scoreGroups[1][0].player.id],
      [otherFirst.player.id, scoreGroups[2][0].player.id],
      `${reason} · 1등 동률 부분 랜덤`
    );
  }

  if (groupSizes === "2-2") {
    const selectedFirst = pickSeededPlayer(
      scoreGroups[0],
      `vegas-tied-first-pair:${previousHole.id}:${hole.id}`
    );
    const selectedLower = pickSeededPlayer(
      scoreGroups[1],
      `vegas-tied-lower-pair:${previousHole.id}:${hole.id}`
    );
    const otherFirst = withoutPicked(scoreGroups[0], [selectedFirst])[0];
    const otherLower = withoutPicked(scoreGroups[1], [selectedLower])[0];

    if (!otherFirst || !otherLower) {
      return createRandomTeamAssignment(hole, players, `vegas-invalid-two-pairs-${previousHole.id}`);
    }

    return createTeamsFromPlayerIds(
      hole,
      [selectedFirst.player.id, selectedLower.player.id],
      [otherFirst.player.id, otherLower.player.id],
      `${reason} · 1등-하위 동률 부분 랜덤`
    );
  }

  if (groupSizes === "3-1") {
    const selectedFirst = pickSeededPlayer(
      scoreGroups[0],
      `vegas-three-tied-first:${previousHole.id}:${hole.id}`
    );
    const otherFirsts = withoutPicked(scoreGroups[0], [selectedFirst]);

    if (otherFirsts.length !== 2) {
      return createRandomTeamAssignment(hole, players, `vegas-invalid-three-first-${previousHole.id}`);
    }

    return createTeamsFromPlayerIds(
      hole,
      [selectedFirst.player.id, scoreGroups[1][0].player.id],
      [otherFirsts[0].player.id, otherFirsts[1].player.id],
      `${reason} · 1등 3명 동률 부분 랜덤`
    );
  }

  if (groupSizes === "1-2-1") {
    return createTeamsFromPlayerIds(
      hole,
      [scoreGroups[0][0].player.id, scoreGroups[2][0].player.id],
      [scoreGroups[1][0].player.id, scoreGroups[1][1].player.id],
      `${reason} · 2등 동률`
    );
  }

  if (groupSizes === "1-3") {
    const selectedSecond = pickSeededPlayer(
      scoreGroups[1],
      `vegas-three-tied-second:${previousHole.id}:${hole.id}`
    );
    const otherSeconds = withoutPicked(scoreGroups[1], [selectedSecond]);

    if (otherSeconds.length !== 2) {
      return createRandomTeamAssignment(hole, players, `vegas-invalid-three-second-${previousHole.id}`);
    }

    return createTeamsFromPlayerIds(
      hole,
      [scoreGroups[0][0].player.id, selectedSecond.player.id],
      [otherSeconds[0].player.id, otherSeconds[1].player.id],
      `${reason} · 2등 3명 동률 부분 랜덤`
    );
  }

  if (groupSizes === "1-1-2") {
    const selectedThird = pickSeededPlayer(
      scoreGroups[2],
      `vegas-tied-third:${previousHole.id}:${hole.id}`
    );
    const otherThird = withoutPicked(scoreGroups[2], [selectedThird])[0];

    if (!otherThird) {
      return createRandomTeamAssignment(hole, players, `vegas-invalid-tied-third-${previousHole.id}`);
    }

    return createTeamsFromPlayerIds(
      hole,
      [scoreGroups[0][0].player.id, selectedThird.player.id],
      [scoreGroups[1][0].player.id, otherThird.player.id],
      `${reason} · 3등 동률 부분 랜덤`
    );
  }

  if (groupSizes === "4") {
    return createRandomTeamAssignment(hole, players, `vegas-all-tied-previous-hole-${previousHole.id}`);
  }

  return createRandomTeamAssignment(
    hole,
    players,
    `vegas-unresolved-tie-previous-hole-${previousHole.id}`
  );
}

'''
    s = s[:start] + new_func + s[end:]
    applied.append("replace previous-rank partial tie resolver")

if "function cloneTeamAssignmentToHole(" not in s:
    anchor = "export function createVegasTeamAssignment(params:"
    helper = '''function cloneTeamAssignmentToHole(
  assignment: TeamAssignment,
  hole: Hole,
  reason: string
): TeamAssignment {
  return {
    holeId: hole.id,
    holeNumber: hole.holeNumber,
    teams: assignment.teams.map((team) => ({
      ...team,
      playerIds: [...team.playerIds],
    })) as [Team, Team],
    reason,
  };
}

function getFirstStoredVegasAssignment(
  teamAssignments: TeamAssignment[] | undefined
): TeamAssignment | null {
  return (teamAssignments ?? [])
    .slice()
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .find((assignment) => assignment.teams.length === 2) ?? null;
}

function createFixedMatchupTeamAssignment(
  hole: Hole,
  players: Player[],
  teamAssignments: TeamAssignment[] | undefined
): TeamAssignment {
  const firstAssignment = getFirstStoredVegasAssignment(teamAssignments);

  if (firstAssignment) {
    return cloneTeamAssignmentToHole(
      firstAssignment,
      hole,
      `맞수 팀 대결 · ${firstAssignment.holeNumber}번 홀 팀 유지`
    );
  }

  return createRandomTeamAssignment(hole, players, "vegas-fixed-matchup-fallback");
}

'''
    if anchor in s:
        s = s.replace(anchor, helper + anchor)
        applied.append("add fixed matchup helpers")
    else:
        skipped.append("add fixed matchup helpers: missing anchor")
else:
    skipped.append("add fixed matchup helpers: already applied")

old = '''  if (settings.teamMode === "previousRanks") {
    return createPreviousRanksTeamAssignment(hole, players, holes, scores);
  }'''
new = '''  if (settings.teamMode === "fixedMatchup") {
    return createFixedMatchupTeamAssignment(hole, players, teamAssignments);
  }

  if (settings.teamMode === "previousRanks") {
    return createPreviousRanksTeamAssignment(hole, players, holes, scores);
  }'''
if new in s:
    skipped.append("createVegasTeamAssignment fixed branch: already applied")
elif old in s:
    s = s.replace(old, new)
    applied.append("createVegasTeamAssignment fixed branch")
else:
    skipped.append("createVegasTeamAssignment fixed branch: missing anchor")

old = '''  if (settings.teamAssignmentMode === "manual") {'''
new = '''  if (settings.teamMode === "fixedMatchup") {
    const fixedAssignment =
      storedAssignment ??
      (getFirstStoredVegasAssignment(teamAssignments)
        ? createFixedMatchupTeamAssignment(nextHole, players, teamAssignments)
        : null);

    return {
      holeId: nextHole.id,
      holeNumber: nextHole.holeNumber,
      gameType: "vegas",
      title: `${nextHole.holeNumber}번 홀 라스베가스`,
      description:
        carriedIn > 0
          ? `이월 ${carriedIn.toLocaleString()}원 포함. 맞수 팀 대결로 같은 팀 구성을 유지합니다.`
          : "맞수 팀 대결로 같은 팀 구성을 유지합니다.",
      baseAmount,
      carriedIn,
      prizeAmount,
      teams: fixedAssignment?.teams,
    };
  }

  if (settings.teamAssignmentMode === "manual") {'''
if new in s:
    skipped.append("preview fixed matchup branch: already applied")
elif old in s:
    s = s.replace(old, new, 1)
    applied.append("preview fixed matchup branch")
else:
    skipped.append("preview fixed matchup branch: missing anchor")

if s != before:
    path.write_text(s)

# app/page.tsx
path = Path("app/page.tsx")
s = path.read_text()
before = s

if 'key: "fixedMatchup"' not in s:
    anchor = '''                    {
                      key: "manualAfterHole",
                      label: "홀 종료 후 직접 입력",'''
    insert = '''                    {
                      key: "fixedMatchup",
                      label: "맞수 팀 대결",
                      teamMode: "fixedMatchup" as const,
                      teamAssignmentMode: "auto" as const,
                    },
'''
    if anchor in s:
        s = s.replace(anchor, insert + anchor)
        applied.append("add fixed matchup setting option")
    else:
        skipped.append("add fixed matchup setting option: missing anchor")
else:
    skipped.append("add fixed matchup setting option: already applied")

pattern = re.compile(r'const shouldManuallySelectFirstVegasTeams\s*=\s*[\s\S]*?;')
replacement = '''const shouldManuallySelectFirstVegasTeams =
    settings.mode === "vegas" &&
    currentHole?.holeNumber === 1 &&
    (settings.vegas.teamMode === "previousRanks" ||
      settings.vegas.teamMode === "fixedMatchup") &&
    !vegasTeamAssignments.some((assignment) => assignment.holeId === currentHole.id);'''
if "settings.vegas.teamMode === \"fixedMatchup\"" in s and "맞수 팀 선택" in s:
    skipped.append("require first-hole team selection for fixed matchup: already applied")
elif pattern.search(s):
    s = pattern.sub(replacement, s, count=1)
    applied.append("require first-hole team selection for fixed matchup")
else:
    skipped.append("require first-hole team selection for fixed matchup: missing anchor")

old = '''{shouldManuallySelectFirstVegasTeams
                    ? "1번 홀 팀 선택"
                    : "이번 홀 팀 직접 입력"}'''
new = '''{settings.vegas.teamMode === "fixedMatchup"
                    ? "맞수 팀 선택"
                    : shouldManuallySelectFirstVegasTeams
                      ? "1번 홀 팀 선택"
                      : "이번 홀 팀 직접 입력"}'''
if new in s:
    skipped.append("manual Vegas card title for fixed matchup: already applied")
elif old in s:
    s = s.replace(old, new)
    applied.append("manual Vegas card title for fixed matchup")
else:
    skipped.append("manual Vegas card title for fixed matchup: missing anchor")

old = '''{shouldManuallySelectFirstVegasTeams
                    ? "1번 홀 팀을 직접 선택하세요. 팀 A 2명을 선택하면 나머지 2명은 팀 B가 됩니다."
                    : "팀 A 2명을 선택하세요. 나머지 2명은 팀 B가 됩니다."}'''
new = '''{settings.vegas.teamMode === "fixedMatchup"
                    ? "1번 홀에서 맞수 팀을 선택하세요. 이 팀 구성이 라운드 종료까지 유지됩니다."
                    : shouldManuallySelectFirstVegasTeams
                      ? "1번 홀 팀을 직접 선택하세요. 팀 A 2명을 선택하면 나머지 2명은 팀 B가 됩니다."
                      : "팀 A 2명을 선택하세요. 나머지 2명은 팀 B가 됩니다."}'''
if new in s:
    skipped.append("manual Vegas card help for fixed matchup: already applied")
elif old in s:
    s = s.replace(old, new)
    applied.append("manual Vegas card help for fixed matchup")
else:
    skipped.append("manual Vegas card help for fixed matchup: missing anchor")

if s != before:
    path.write_text(s)

print(f"Applied {len(applied)} patch step(s).")
for item in applied:
    print("  +", item)
print(f"Skipped {len(skipped)} patch step(s).")
for item in skipped:
    print("  -", item)
