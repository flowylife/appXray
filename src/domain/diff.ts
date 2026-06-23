import { isConfirmedXrayObject } from "./status.js";
import type { XrayObject, XraySuggestionSet } from "./types.js";
import type { XraySuggestionBucket } from "./workspace.js";

export type StructureDiffType =
  | "added"
  | "removed"
  | "changed"
  | "status_changed"
  | "preserved_confirmed";

export type StructureDiffEntry = {
  bucket: XraySuggestionBucket;
  objectId: string;
  key: string;
  diffType: StructureDiffType;
};

export type StructureDiffReport = {
  entries: StructureDiffEntry[];
  counts: Record<StructureDiffType, number>;
};

const EMPTY_COUNTS: Record<StructureDiffType, number> = {
  added: 0,
  removed: 0,
  changed: 0,
  status_changed: 0,
  preserved_confirmed: 0,
};

export function compareSuggestionSets(before: XraySuggestionSet, after: XraySuggestionSet): StructureDiffReport {
  const entries = [
    ...compareCollection("requirements", before.requirements, after.requirements),
    ...compareCollection("screens", before.screens, after.screens),
    ...compareCollection("features", before.features, after.features),
    ...compareCollection("dataObjects", before.dataObjects, after.dataObjects),
    ...compareCollection("dataFields", before.dataFields, after.dataFields),
    ...compareCollection("dataRelations", before.dataRelations, after.dataRelations),
    ...compareCollection("roles", before.roles, after.roles),
    ...compareCollection("permissions", before.permissions, after.permissions),
    ...compareCollection("flows", before.flows, after.flows),
    ...compareCollection("flowSteps", before.flowSteps, after.flowSteps),
    ...compareCollection("issues", before.issues, after.issues),
  ];

  return {
    entries,
    counts: entries.reduce(
      (counts, entry) => ({
        ...counts,
        [entry.diffType]: counts[entry.diffType] + 1,
      }),
      { ...EMPTY_COUNTS },
    ),
  };
}

function compareCollection<T extends XrayObject>(
  bucket: XraySuggestionBucket,
  before: T[],
  after: T[],
): StructureDiffEntry[] {
  const beforeByKey = new Map(before.map((object) => [diffKey(object), object]));
  const afterByKey = new Map(after.map((object) => [diffKey(object), object]));
  const entries: StructureDiffEntry[] = [];

  for (const [key, afterObject] of afterByKey) {
    const beforeObject = beforeByKey.get(key);
    if (!beforeObject) {
      entries.push(toEntry(bucket, afterObject, key, "added"));
      continue;
    }
    if (beforeObject.status !== afterObject.status) {
      entries.push(toEntry(bucket, afterObject, key, "status_changed"));
      continue;
    }
    if (isConfirmedXrayObject(beforeObject) && stableObjectJson(beforeObject) === stableObjectJson(afterObject)) {
      entries.push(toEntry(bucket, afterObject, key, "preserved_confirmed"));
      continue;
    }
    if (stableObjectJson(beforeObject) !== stableObjectJson(afterObject)) {
      entries.push(toEntry(bucket, afterObject, key, "changed"));
    }
  }

  for (const [key, beforeObject] of beforeByKey) {
    if (!afterByKey.has(key)) {
      entries.push(toEntry(bucket, beforeObject, key, "removed"));
    }
  }

  return entries;
}

function toEntry(
  bucket: XraySuggestionBucket,
  object: XrayObject,
  key: string,
  diffType: StructureDiffType,
): StructureDiffEntry {
  return {
    bucket,
    objectId: object.id,
    key,
    diffType,
  };
}

function diffKey(object: XrayObject): string {
  return object.origin?.tempId ?? object.id;
}

function stableObjectJson(object: XrayObject): string {
  const { updatedAt: _updatedAt, ...stableObject } = object;
  return JSON.stringify(stableObject);
}
