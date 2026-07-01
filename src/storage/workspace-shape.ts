import type { XraySuggestionSet } from "../domain/types.js";
import type { ProjectWorkspace, XraySuggestionBucket } from "../domain/workspace.js";

const REQUIRED_SUGGESTION_BUCKETS: XraySuggestionBucket[] = [
  "requirements",
  "screens",
  "features",
  "dataObjects",
  "dataFields",
  "dataRelations",
  "roles",
  "permissions",
  "flows",
  "flowSteps",
  "issues",
];

const VALID_SUGGESTION_STATUSES = new Set(["suggested", "accepted", "edited", "rejected", "deferred"]);

type BucketGuard = (value: unknown) => boolean;

const BUCKET_GUARDS: Record<XraySuggestionBucket, BucketGuard> = {
  requirements: (value) =>
    hasBaseObject(value) &&
    isString(value.sourceDocumentId) &&
    isString(value.text) &&
    isString(value.requirementType),
  screens: (value) =>
    hasBaseObject(value) &&
    isString(value.name) &&
    isString(value.screenType),
  features: (value) =>
    hasBaseObject(value) &&
    isString(value.name) &&
    isString(value.actionType),
  dataObjects: (value) =>
    hasBaseObject(value) &&
    isString(value.name) &&
    isString(value.objectType),
  dataFields: (value) =>
    hasBaseObject(value) &&
    isString(value.dataObjectId) &&
    isString(value.name) &&
    isString(value.fieldType),
  dataRelations: (value) =>
    hasBaseObject(value) &&
    isString(value.sourceObjectId) &&
    isString(value.targetObjectId) &&
    isString(value.relationType),
  roles: (value) =>
    hasBaseObject(value) &&
    isString(value.name),
  permissions: (value) =>
    hasBaseObject(value) &&
    isString(value.roleId) &&
    isString(value.targetType) &&
    isString(value.action) &&
    typeof value.allowed === "boolean",
  flows: (value) =>
    hasBaseObject(value) &&
    isString(value.name),
  flowSteps: (value) =>
    hasBaseObject(value) &&
    isString(value.flowId) &&
    typeof value.stepOrder === "number" &&
    isString(value.actionDescription),
  issues: (value) =>
    hasBaseObject(value) &&
    isString(value.issueType) &&
    isString(value.severity) &&
    isString(value.title) &&
    isString(value.description),
};

export function isStoredProjectWorkspace(value: unknown): value is ProjectWorkspace {
  if (!isRecord(value)) return false;
  return (
    isProjectLike(value.project) &&
    isSourceDocumentList(value.sourceDocuments) &&
    isSuggestionSetLike(value.objects) &&
    isBuildPlanSuggestionList(value.buildPlanSuggestions) &&
    isString(value.updatedAt)
  );
}

function isProjectLike(value: unknown): value is ProjectWorkspace["project"] {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isStringList(value.appTypes) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isSourceDocumentList(value: unknown): boolean {
  return Array.isArray(value) && value.every((source) =>
    isRecord(source) &&
    isString(source.id) &&
    isString(source.projectId) &&
    isString(source.title) &&
    isString(source.content) &&
    isString(source.sourceType) &&
    typeof source.version === "number" &&
    isString(source.createdAt),
  );
}

function isSuggestionSetLike(value: unknown): value is XraySuggestionSet {
  if (!isRecord(value)) return false;
  return REQUIRED_SUGGESTION_BUCKETS.every((bucket) =>
    Array.isArray(value[bucket]) && value[bucket].every(BUCKET_GUARDS[bucket]),
  );
}

function isBuildPlanSuggestionList(value: unknown): boolean {
  return Array.isArray(value) && value.every((step) =>
    isRecord(step) &&
    isString(step.tempId) &&
    typeof step.confidence === "number" &&
    isString(step.title) &&
    isString(step.description),
  );
}

function hasBaseObject(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.projectId) &&
    isString(value.status) &&
    VALID_SUGGESTION_STATUSES.has(value.status) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
