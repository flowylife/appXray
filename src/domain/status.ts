import type {
  BaseXrayObject,
  ConfidenceBand,
  ConfirmedSuggestionStatus,
  SuggestionStatus,
} from "./types.js";

export function isConfirmedStatus(
  status: SuggestionStatus,
): status is ConfirmedSuggestionStatus {
  return status === "accepted" || status === "edited";
}

export function isConfirmedXrayObject<T extends BaseXrayObject>(
  object: T,
): object is T & { status: ConfirmedSuggestionStatus } {
  return isConfirmedStatus(object.status);
}

export function getDefaultExportableObjects<T extends BaseXrayObject>(
  objects: readonly T[],
): Array<T & { status: ConfirmedSuggestionStatus }> {
  return objects.filter(isConfirmedXrayObject);
}

export function toConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return "likely";
  if (confidence >= 0.45) return "review";
  return "weak";
}
