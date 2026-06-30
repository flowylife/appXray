import { isConfirmedXrayObject } from "./status.js";
import type { BaseXrayObject, SuggestionStatus, XrayObject, XraySuggestionSet } from "./types.js";
import type { AnalysisChange, XraySuggestionBucket } from "./workspace.js";

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

export type ReviewStatusDecision = {
  bucket: XraySuggestionBucket;
  objectId: string;
  previousObject: XrayObject;
  nextStatus: SuggestionStatus;
};

export type ReviewStatusDecisionGroup = {
  id: string;
  decidedAt: string;
  decisions: ReviewStatusDecision[];
};

export function applyStatusDecisionToSuggestionSet(
  existing: XraySuggestionSet,
  bucket: XraySuggestionBucket,
  objectIds: string[],
  nextStatus: SuggestionStatus,
  now = new Date().toISOString(),
  decisionId = `decision_${now}`,
): { objects: XraySuggestionSet; decisionGroup: ReviewStatusDecisionGroup | null } {
  const targetIds = new Set(objectIds);
  const decisions: ReviewStatusDecision[] = [];
  const collection = existing[bucket] as XrayObject[];
  const nextCollection = collection.map((object) => {
    if (!targetIds.has(object.id) || object.status === nextStatus) return object;
    decisions.push({
      bucket,
      objectId: object.id,
      previousObject: object,
      nextStatus,
    });
    return updateXrayObjectStatus(object, nextStatus, now);
  });

  return {
    objects: {
      ...existing,
      [bucket]: nextCollection,
    },
    decisionGroup: decisions.length
      ? {
        id: decisionId,
        decidedAt: now,
        decisions,
      }
      : null,
  };
}

export function undoLatestStatusDecision(
  existing: XraySuggestionSet,
  history: ReviewStatusDecisionGroup[],
): { objects: XraySuggestionSet; history: ReviewStatusDecisionGroup[]; restoredCount: number } {
  const latest = history.at(-1);
  if (!latest) {
    return { objects: existing, history, restoredCount: 0 };
  }

  const restored = latest.decisions.reduce<XraySuggestionSet>((objects, decision) => {
    const collection = objects[decision.bucket] as XrayObject[];
    return {
      ...objects,
      [decision.bucket]: collection.map((object) =>
        object.id === decision.objectId ? decision.previousObject : object,
      ),
    };
  }, existing);

  return {
    objects: restored,
    history: history.slice(0, -1),
    restoredCount: latest.decisions.length,
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
  preservedReviewDecisionCount: number;
  changes: AnalysisChange[];
};

export function summarizeSuggestionMergeImpact(
  existing: XraySuggestionSet,
  incoming: XraySuggestionSet,
): SuggestionMergeImpact {
  const impacts = [
    summarizeCollection("requirements", existing.requirements, incoming.requirements),
    summarizeCollection("screens", existing.screens, incoming.screens),
    summarizeCollection("features", existing.features, incoming.features),
    summarizeCollection("dataObjects", existing.dataObjects, incoming.dataObjects),
    summarizeCollection("dataFields", existing.dataFields, incoming.dataFields),
    summarizeCollection("dataRelations", existing.dataRelations, incoming.dataRelations),
    summarizeCollection("roles", existing.roles, incoming.roles),
    summarizeCollection("permissions", existing.permissions, incoming.permissions),
    summarizeCollection("flows", existing.flows, incoming.flows),
    summarizeCollection("flowSteps", existing.flowSteps, incoming.flowSteps),
    summarizeCollection("issues", existing.issues, incoming.issues),
  ];

  return impacts.reduce(
    (total, impact) => ({
      incomingSuggestedCount: total.incomingSuggestedCount + impact.incomingSuggestedCount,
      addedSuggestedCount: total.addedSuggestedCount + impact.addedSuggestedCount,
      refreshedSuggestedCount: total.refreshedSuggestedCount + impact.refreshedSuggestedCount,
      preservedConfirmedCount: total.preservedConfirmedCount + impact.preservedConfirmedCount,
      preservedReviewDecisionCount: total.preservedReviewDecisionCount + impact.preservedReviewDecisionCount,
      changes: [...total.changes, ...impact.changes],
    }),
    {
      incomingSuggestedCount: 0,
      addedSuggestedCount: 0,
      refreshedSuggestedCount: 0,
      preservedConfirmedCount: 0,
      preservedReviewDecisionCount: 0,
      changes: [],
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
    if (current && isUserReviewedXrayObject(current)) continue;
    result.set(key, object);
  }

  return Array.from(result.values());
}

function summarizeCollection<T extends XrayObject>(
  bucket: XraySuggestionBucket,
  existing: T[],
  incoming: T[],
): SuggestionMergeImpact {
  const existingByKey = new Map(existing.map((object) => [mergeKey(object), object]));

  return incoming.reduce<SuggestionMergeImpact>(
    (impact, object) => {
      const current = existingByKey.get(mergeKey(object));
      if (!current) {
        return {
          ...impact,
          incomingSuggestedCount: impact.incomingSuggestedCount + 1,
          addedSuggestedCount: impact.addedSuggestedCount + 1,
          changes: [
            ...impact.changes,
            {
              bucket,
              objectId: object.id,
              changeType: "added_suggestion",
            },
          ],
        };
      }
      if (isConfirmedXrayObject(current)) {
        return {
          ...impact,
          incomingSuggestedCount: impact.incomingSuggestedCount + 1,
          preservedConfirmedCount: impact.preservedConfirmedCount + 1,
          changes: [
            ...impact.changes,
            {
              bucket,
              objectId: current.id,
              changeType: "preserved_confirmed",
            },
          ],
        };
      }
      if (isUserReviewedXrayObject(current)) {
        return {
          ...impact,
          incomingSuggestedCount: impact.incomingSuggestedCount + 1,
          preservedReviewDecisionCount: impact.preservedReviewDecisionCount + 1,
          changes: [
            ...impact.changes,
            {
              bucket,
              objectId: current.id,
              changeType: "preserved_review_decision",
            },
          ],
        };
      }
      return {
        ...impact,
        incomingSuggestedCount: impact.incomingSuggestedCount + 1,
        refreshedSuggestedCount: impact.refreshedSuggestedCount + 1,
        changes: [
          ...impact.changes,
          {
            bucket,
            objectId: object.id,
            changeType: "refreshed_suggestion",
          },
        ],
      };
    },
    {
      incomingSuggestedCount: 0,
      addedSuggestedCount: 0,
      refreshedSuggestedCount: 0,
      preservedConfirmedCount: 0,
      preservedReviewDecisionCount: 0,
      changes: [],
    },
  );
}

function mergeKey(object: XrayObject): string {
  return object.origin?.tempId ?? object.id;
}

function isUserReviewedXrayObject(object: XrayObject): boolean {
  return object.status !== "suggested";
}
