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

export type SuggestionMergeImpact = {
  incomingSuggestedCount: number;
  addedSuggestedCount: number;
  refreshedSuggestedCount: number;
  preservedConfirmedCount: number;
};

export function summarizeSuggestionMergeImpact(
  existing: XraySuggestionSet,
  incoming: XraySuggestionSet,
): SuggestionMergeImpact {
  const impacts = [
    summarizeCollection(existing.requirements, incoming.requirements),
    summarizeCollection(existing.screens, incoming.screens),
    summarizeCollection(existing.features, incoming.features),
    summarizeCollection(existing.dataObjects, incoming.dataObjects),
    summarizeCollection(existing.dataFields, incoming.dataFields),
    summarizeCollection(existing.dataRelations, incoming.dataRelations),
    summarizeCollection(existing.roles, incoming.roles),
    summarizeCollection(existing.permissions, incoming.permissions),
    summarizeCollection(existing.flows, incoming.flows),
    summarizeCollection(existing.flowSteps, incoming.flowSteps),
    summarizeCollection(existing.issues, incoming.issues),
  ];

  return impacts.reduce(
    (total, impact) => ({
      incomingSuggestedCount: total.incomingSuggestedCount + impact.incomingSuggestedCount,
      addedSuggestedCount: total.addedSuggestedCount + impact.addedSuggestedCount,
      refreshedSuggestedCount: total.refreshedSuggestedCount + impact.refreshedSuggestedCount,
      preservedConfirmedCount: total.preservedConfirmedCount + impact.preservedConfirmedCount,
    }),
    {
      incomingSuggestedCount: 0,
      addedSuggestedCount: 0,
      refreshedSuggestedCount: 0,
      preservedConfirmedCount: 0,
    },
  );
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

function summarizeCollection<T extends XrayObject>(existing: T[], incoming: T[]): SuggestionMergeImpact {
  const existingByKey = new Map(existing.map((object) => [mergeKey(object), object]));

  return incoming.reduce<SuggestionMergeImpact>(
    (impact, object) => {
      const current = existingByKey.get(mergeKey(object));
      if (!current) {
        return {
          ...impact,
          incomingSuggestedCount: impact.incomingSuggestedCount + 1,
          addedSuggestedCount: impact.addedSuggestedCount + 1,
        };
      }
      if (isConfirmedXrayObject(current)) {
        return {
          ...impact,
          incomingSuggestedCount: impact.incomingSuggestedCount + 1,
          preservedConfirmedCount: impact.preservedConfirmedCount + 1,
        };
      }
      return {
        ...impact,
        incomingSuggestedCount: impact.incomingSuggestedCount + 1,
        refreshedSuggestedCount: impact.refreshedSuggestedCount + 1,
      };
    },
    {
      incomingSuggestedCount: 0,
      addedSuggestedCount: 0,
      refreshedSuggestedCount: 0,
      preservedConfirmedCount: 0,
    },
  );
}

function mergeKey(object: XrayObject): string {
  return object.origin?.tempId ?? object.id;
}
