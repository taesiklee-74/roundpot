export type NearGameKind = "stroke" | "skins" | "vegas" | "hussein" | "school";

export type NearResult = {
  holeId: string;
  holeNumber: number;
  gameKind: NearGameKind;
  winnerPlayerId: string | null;
  amount: number;
};

export type NearPreviewLike = unknown;

export function getNearResultForHole(
  nearResults: NearResult[],
  holeId: string
): NearResult | null {
  return nearResults.find((result) => result.holeId === holeId) ?? null;
}

function getPreviewInnerGameType(
  preview: NearPreviewLike
): "skins" | "hussein" | "vegas" | null {
  if (!preview || typeof preview !== "object") {
    return null;
  }

  if (!("innerGameType" in preview)) {
    return null;
  }

  const innerGameType = preview.innerGameType;

  if (
    innerGameType === "skins" ||
    innerGameType === "hussein" ||
    innerGameType === "vegas"
  ) {
    return innerGameType;
  }

  return null;
}

export function getNearGameKindFromPreview(
  mode: string,
  preview: NearPreviewLike
): NearGameKind {
  const innerGameType = getPreviewInnerGameType(preview);

  if (innerGameType) {
    return innerGameType;
  }

  if (
    mode === "stroke" ||
    mode === "skins" ||
    mode === "vegas" ||
    mode === "hussein" ||
    mode === "school"
  ) {
    return mode;
  }

  return "stroke";
}