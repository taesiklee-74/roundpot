// app/utils/courseLibrary.ts

export type SavedCourseSource = "manual" | "image" | "web";

export type SavedCourse = {
  id: string;
  name: string;
  holeCount: 9 | 18;
  pars: Array<3 | 4 | 5>;
  handicapRanks: Array<number | null>;
  source: SavedCourseSource;
  updatedAt: string;
};

const COURSE_LIBRARY_STORAGE_KEY = "roundpot.savedCourses.v1";

function isValidHoleCount(value: unknown): value is 9 | 18 {
  return value === 9 || value === 18;
}

function normalizePars(value: unknown, holeCount: 9 | 18): Array<3 | 4 | 5> {
  const rawPars = Array.isArray(value) ? value : [];

  return Array.from({ length: holeCount }, (_, index) => {
    const par = rawPars[index];
    return par === 3 || par === 4 || par === 5 ? par : 4;
  });
}

function normalizeHandicapRanks(
  value: unknown,
  holeCount: 9 | 18
): Array<number | null> {
  const rawRanks = Array.isArray(value) ? value : [];

  return Array.from({ length: holeCount }, (_, index) => {
    const rank = rawRanks[index];

    if (
      typeof rank === "number" &&
      Number.isInteger(rank) &&
      rank >= 1 &&
      rank <= holeCount
    ) {
      return rank;
    }

    return null;
  });
}

function normalizeSavedCourse(value: unknown): SavedCourse | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<SavedCourse>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const holeCount = isValidHoleCount(raw.holeCount) ? raw.holeCount : null;

  if (!name || !holeCount) return null;

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id
        : `course-${Date.now()}`,
    name,
    holeCount,
    pars: normalizePars(raw.pars, holeCount),
    handicapRanks: normalizeHandicapRanks(raw.handicapRanks, holeCount),
    source:
      raw.source === "image" || raw.source === "web" || raw.source === "manual"
        ? raw.source
        : "manual",
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export function loadSavedCourses(): SavedCourse[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(COURSE_LIBRARY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeSavedCourse)
      .filter((course): course is SavedCourse => course !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function saveSavedCourses(courses: SavedCourse[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    COURSE_LIBRARY_STORAGE_KEY,
    JSON.stringify(
      courses
        .map(normalizeSavedCourse)
        .filter((course): course is SavedCourse => course !== null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    )
  );
}
