// app/api/course-card/extract/route.ts

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ExtractedCourseInfo = {
  courseName: string;
  holeCount: 9 | 18;
  pars: Array<3 | 4 | 5>;
  handicapRanks: Array<number | null>;
  confidence: "low" | "medium" | "high";
  warnings: string[];
};

const COURSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["courseName", "holeCount", "pars", "handicapRanks", "confidence", "warnings"],
  properties: {
    courseName: {
      type: "string",
      description: "Golf course or course name if visible. Empty string if not visible.",
    },
    holeCount: {
      type: "integer",
      enum: [9, 18],
    },
    pars: {
      type: "array",
      items: {
        type: "integer",
        enum: [3, 4, 5],
      },
      minItems: 9,
      maxItems: 18,
    },
    handicapRanks: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "integer",
            minimum: 1,
            maximum: 18,
          },
          {
            type: "null",
          },
        ],
      },
      minItems: 9,
      maxItems: 18,
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
};

function normalizeHoleCount(value: unknown): 9 | 18 {
  return value === 18 ? 18 : 9;
}

function normalizePars(value: unknown, holeCount: 9 | 18): Array<3 | 4 | 5> {
  const raw = Array.isArray(value) ? value : [];

  return Array.from({ length: holeCount }, (_, index) => {
    const par = raw[index];
    return par === 3 || par === 4 || par === 5 ? par : 4;
  });
}

function normalizeHandicapRanks(
  value: unknown,
  holeCount: 9 | 18
): Array<number | null> {
  const raw = Array.isArray(value) ? value : [];

  return Array.from({ length: holeCount }, (_, index) => {
    const rank = raw[index];

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

function normalizeExtractedCourse(value: unknown): ExtractedCourseInfo {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const holeCount = normalizeHoleCount(raw.holeCount);

  const confidence =
    raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
      ? raw.confidence
      : "low";

  return {
    courseName: typeof raw.courseName === "string" ? raw.courseName.trim() : "",
    holeCount,
    pars: normalizePars(raw.pars, holeCount),
    handicapRanks: normalizeHandicapRanks(raw.handicapRanks, holeCount),
    confidence,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function extractOutputText(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  const root = data as Record<string, unknown>;

  if (typeof root.output_text === "string") {
    return root.output_text;
  }

  const output = Array.isArray(root.output) ? root.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;

    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;

      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  return "";
}

export async function POST(request: Request) {
  const rawApiKey = process.env.OPENAI_API_KEY;
    const apiKey = rawApiKey?.trim();
  const model = process.env.OPENAI_COURSE_EXTRACT_MODEL || "gpt-4.1-mini";
    const hasInvalidApiKey =
      !apiKey ||
      apiKey.includes("여기") ||
      !apiKey.startsWith("sk-") ||
      /[^\x20-\x7E]/.test(apiKey);

    if (hasInvalidApiKey) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY가 올바르게 설정되어 있지 않습니다.",
          detail: ".env.local의 OPENAI_API_KEY 값을 실제 sk-... API 키로 바꾼 뒤 dev 서버를 재시작해 주세요.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
  const file = formData.get("file");
  const courseNameHint = String(formData.get("courseName") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "이미지 파일이 없습니다." },
      { status: 400 }
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드할 수 있습니다." },
      { status: 400 }
    );
  }

  const maxSizeBytes = 8 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return NextResponse.json(
      { error: "이미지 파일은 8MB 이하로 업로드해 주세요." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  const prompt = [
    "You are extracting golf course scorecard data from an image.",
    "Return only the visible course data.",
    "Extract hole count, per-hole par values, and per-hole handicap or stroke index ranks.",
    "Use 9 holes if only front nine or back nine is visible. Use 18 holes if both nines are visible.",
    "Pars must be only 3, 4, or 5.",
    "Handicap ranks should be integers. Use null for any missing or unreadable hole handicap rank.",
    "Do not invent values. If a value is uncertain, choose the most likely value and add a Korean warning.",
    courseNameHint ? `Course name hint from user: ${courseNameHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: dataUrl,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "course_card_extraction",
          strict: true,
          schema: COURSE_SCHEMA,
        },
      },
    }),
  });

  const responseText = await response.text();
  let data: unknown = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        {
          error: "이미지 분석 서버 응답을 해석하지 못했습니다.",
          detail: `OpenAI API가 JSON이 아닌 응답을 반환했습니다. 상태 코드: ${response.status}`,
        },
        { status: 502 }
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: { message?: string } }).error?.message
        : undefined;

    return NextResponse.json(
      {
        error: "이미지 분석에 실패했습니다.",
        detail: errorMessage ?? `OpenAI API error. 상태 코드: ${response.status}`,
      },
      { status: response.status }
    );
  }

  const outputText = extractOutputText(data);

  try {
    const parsed = JSON.parse(outputText);
    const course = normalizeExtractedCourse(parsed);

    return NextResponse.json({ course });
  } catch {
    return NextResponse.json(
      {
        error: "추출 결과 JSON을 해석하지 못했습니다.",
        raw: outputText,
      },
      { status: 500 }
    );
  }
}
