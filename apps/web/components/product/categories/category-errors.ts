export type CategoryError = "taken" | "takenInactive" | "invalidName" | "hasProducts" | "notEmpty" | "gone" | "network" | "failed";

export const NAME_MAX = 50;

// the server's reason, turned into one of the translated messages; no data.code means no answer from the API
export function categoryError(error: unknown): CategoryError {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  switch (code) {
    case undefined:
      return "network";
    case "CONFLICT":
      return "taken";
    case "BAD_REQUEST":
      return "invalidName";
    case "PRECONDITION_FAILED":
      return "hasProducts";
    case "NOT_FOUND":
      return "gone";
    default:
      return "failed";
  }
}

// checked before saving, so an empty or overlong name never reaches the server
export function nameProblem(name: string): CategoryError | null {
  const trimmed = name.trim();
  return trimmed.length === 0 || trimmed.length > NAME_MAX ? "invalidName" : null;
}
