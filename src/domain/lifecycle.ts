import { isConfirmedXrayObject } from "./status.js";
import type { BaseXrayObject, SuggestionStatus, XrayObject, XraySuggestionSet } from "./types.js";

export function updateXrayObjectStatus<T extends BaseXrayObject>(
  object: T,
  nextStatus: SuggestionStatus,
  now = new Date().toISOString(),
): T {
  return { ...object, status: nextStatus, updatedAt: now };
}

export function editXrayObject<T extends BaseXrayObject>(
  object: T,
  patch: Partial<Omit<T, keyof BaseXrayObject>>,
  now = new Date().toISOString(),
): T {
  return {
    ...object,
    ...patch,
    status: "edited",
    updatedAt: now,
  };
}

export function mergeAiSuggestionsPreservingConfirmed(
  existing: XraySuggestionSet,
  incoming: XraySuggestionSet,
): XraySuggestionSet {
  return {
    requirements: mergeCollection(existing.requirements, incoming.requirements),
    screens: mergeCollection(existing.screens, incoming.screens),
    features: mergeCollection(existing.features, incoming.features),
    dataObjects: mergeCollection(existing.dataObjects, incoming.dataObjects),
    dataFields: mergeCollection(existing.dataFields, incoming.dataFields),
    dataRelations: mergeCollection(existing.dataRelations, incoming.dataRelations),
    roles: mergeCollection(existing.roles, incoming.roles),
    permissions: mergeCollection(existing.permissions, incoming.permissions),
    flows: mergeCollection(existing.flows, incoming.flows),
    flowSteps: mergeCollection(existing.flowSteps, incoming.flowSteps),
    issues: mergeCollection(existing.issues, incoming.issues),
  };
}

function mergeCollection<T extends XrayObject>(existing: T[], incoming: T[]): T[] {
  const result = new Map<string, T>();

  for (const object of existing) {
    result.set(mergeKey(object), object);
  }

  for (const object of incoming) {
    const key = mergeKey(object);
    const current = result.get(key);
    if (current && isConfirmedXrayObject(current)) continue;
    result.set(key, object);
  }

  return Array.from(result.values());
}

function mergeKey(object: XrayObject): string {
  return object.origin?.tempId ?? object.id;
}
