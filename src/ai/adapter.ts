import type {
  AiAnalysisResult,
  AiDataObjectSuggestion,
  AiFlowSuggestion,
  AiSuggestionBase,
} from "../domain/ai-analysis.js";
import type { SourceDocument } from "../domain/types.js";
import { mockFieldPowerAppAnalysis } from "../fixtures/field-power-app.js";
import type { AiProviderConfig } from "./settings.js";

export type AiProviderAdapter = {
  analyze(input: AiAnalysisInput): Promise<AiAnalysisResult>;
  validateConnection(config: AiProviderConfig): AiProviderConnectionResult;
  supportsStructuredJson: boolean;
};

export type AiAnalysisInput = {
  sourceDocument: SourceDocument;
};

export type AiAnalysisValidationResult =
  | { ok: true; result: AiAnalysisResult; errors: [] }
  | { ok: false; result?: undefined; errors: string[] };

export type AiProviderConnectionResult =
  | { ok: true; checkedAt: string }
  | { ok: false; error: string; checkedAt: string };

const REQUIRED_ARRAY_FIELDS = [
  "requirements",
  "screens",
  "features",
  "dataObjects",
  "dataRelations",
  "roles",
  "permissions",
  "flows",
  "issues",
  "buildPlan",
] as const;

const REQUIREMENT_TYPES = ["screen", "feature", "data", "permission", "flow", "non_functional", "business_rule", "unknown"] as const;
const SCREEN_TYPES = ["dashboard", "list", "detail", "form", "settings", "admin", "report", "canvas", "modal", "unknown"] as const;
const ACTION_TYPES = ["create", "read", "update", "delete", "search", "filter", "import", "export", "notify", "approve", "visualize", "unknown"] as const;
const DATA_OBJECT_TYPES = ["person", "role", "asset", "location", "event", "record", "file", "transaction", "setting", "unknown"] as const;
const DATA_FIELD_TYPES = ["text", "number", "boolean", "date", "datetime", "enum", "relation", "file", "json", "unknown"] as const;
const RELATION_TYPES = ["one_to_one", "one_to_many", "many_to_one", "many_to_many", "contains", "references", "owns", "creates", "unknown"] as const;
const PERMISSION_TARGET_TYPES = ["screen", "feature", "dataObject", "project"] as const;
const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "export", "approve", "manage"] as const;
const ISSUE_TYPES = ["missing", "ambiguous", "conflict", "data_gap", "permission_gap", "state_gap", "exception_gap", "scope_risk"] as const;
const ISSUE_SEVERITIES = ["low", "medium", "high"] as const;

export const mockAiProviderAdapter: AiProviderAdapter = {
  supportsStructuredJson: true,
  async analyze() {
    return mockFieldPowerAppAnalysis;
  },
  validateConnection() {
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
    };
  },
};

export function validateAiAnalysisResult(value: unknown): AiAnalysisValidationResult {
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["AI 분석 결과가 객체가 아닙니다."] };
  }

  const candidate = value as Partial<AiAnalysisResult>;
  const errors: string[] = [];

  if (!candidate.summary || typeof candidate.summary !== "object") {
    errors.push("summary가 없습니다.");
  } else {
    if (!Array.isArray(candidate.summary.appTypes)) errors.push("summary.appTypes는 배열이어야 합니다.");
    if (!isValidConfidence(candidate.summary.confidence)) errors.push("summary.confidence는 0 이상 1 이하 숫자여야 합니다.");
    if (typeof candidate.summary.plainLanguageSummary !== "string") {
      errors.push("summary.plainLanguageSummary는 문자열이어야 합니다.");
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(candidate[field])) {
      errors.push(`${field}는 배열이어야 합니다.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const analysis = candidate as AiAnalysisResult;
  checkRequiredSuggestionFields(errors, analysis);
  checkDuplicateTempIds(errors, "requirements", analysis.requirements);
  checkDuplicateTempIds(errors, "screens", analysis.screens);
  checkDuplicateTempIds(errors, "features", analysis.features);
  checkDuplicateTempIds(errors, "dataObjects", analysis.dataObjects);
  checkDuplicateTempIds(errors, "dataRelations", analysis.dataRelations);
  checkDuplicateTempIds(errors, "roles", analysis.roles);
  checkDuplicateTempIds(errors, "permissions", analysis.permissions);
  checkDuplicateTempIds(errors, "flows", analysis.flows);
  checkDuplicateTempIds(errors, "issues", analysis.issues);
  checkDuplicateTempIds(errors, "buildPlan", analysis.buildPlan);

  for (const object of analysis.dataObjects) {
    if (!Array.isArray(object.fields)) {
      errors.push(`dataObjects.${object.tempId}.fields는 배열이어야 합니다.`);
      continue;
    }
    checkDuplicateNestedTempIds(errors, `dataObjects.${object.tempId}.fields`, object.fields);
  }

  for (const flow of analysis.flows) {
    if (!Array.isArray(flow.steps)) {
      errors.push(`flows.${flow.tempId}.steps는 배열이어야 합니다.`);
      continue;
    }
    checkDuplicateNestedTempIds(errors, `flows.${flow.tempId}.steps`, flow.steps);
  }

  checkConfidenceValues(errors, analysis);
  checkReferences(errors, analysis);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, result: analysis, errors: [] };
}

function checkRequiredSuggestionFields(errors: string[], analysis: AiAnalysisResult): void {
  for (const requirement of analysis.requirements) {
    requireString(errors, "requirements", requirement.tempId, "text", requirement.text);
    requireOneOf(errors, "requirements", requirement.tempId, "requirementType", requirement.requirementType, REQUIREMENT_TYPES);
  }
  for (const screen of analysis.screens) {
    requireString(errors, "screens", screen.tempId, "name", screen.name);
    requireOneOf(errors, "screens", screen.tempId, "screenType", screen.screenType, SCREEN_TYPES);
    requireOptionalStringArray(errors, "screens", screen.tempId, "relatedRequirementTempIds", screen.relatedRequirementTempIds);
  }
  for (const feature of analysis.features) {
    requireString(errors, "features", feature.tempId, "name", feature.name);
    requireOneOf(errors, "features", feature.tempId, "actionType", feature.actionType, ACTION_TYPES);
    requireOptionalStringArray(errors, "features", feature.tempId, "relatedRequirementTempIds", feature.relatedRequirementTempIds);
  }
  for (const dataObject of analysis.dataObjects) {
    requireString(errors, "dataObjects", dataObject.tempId, "name", dataObject.name);
    requireOneOf(errors, "dataObjects", dataObject.tempId, "objectType", dataObject.objectType, DATA_OBJECT_TYPES);
    for (const field of Array.isArray(dataObject.fields) ? dataObject.fields : []) {
      requireString(errors, `dataObjects.${dataObject.tempId}.fields`, field.tempId, "name", field.name);
      requireOneOf(errors, `dataObjects.${dataObject.tempId}.fields`, field.tempId, "fieldType", field.fieldType, DATA_FIELD_TYPES);
      requireOptionalStringArray(errors, `dataObjects.${dataObject.tempId}.fields`, field.tempId, "enumValues", field.enumValues);
    }
  }
  for (const relation of analysis.dataRelations) {
    requireString(errors, "dataRelations", relation.tempId, "sourceObjectTempId", relation.sourceObjectTempId);
    requireString(errors, "dataRelations", relation.tempId, "targetObjectTempId", relation.targetObjectTempId);
    requireOneOf(errors, "dataRelations", relation.tempId, "relationType", relation.relationType, RELATION_TYPES);
  }
  for (const role of analysis.roles) {
    requireString(errors, "roles", role.tempId, "name", role.name);
  }
  for (const permission of analysis.permissions) {
    requireString(errors, "permissions", permission.tempId, "roleTempId", permission.roleTempId);
    requireOneOf(errors, "permissions", permission.tempId, "targetType", permission.targetType, PERMISSION_TARGET_TYPES);
    requireOneOf(errors, "permissions", permission.tempId, "action", permission.action, PERMISSION_ACTIONS);
    if (typeof permission.allowed !== "boolean") errors.push(`permissions.${permission.tempId}.allowed는 boolean이어야 합니다.`);
  }
  for (const flow of analysis.flows) {
    requireString(errors, "flows", flow.tempId, "name", flow.name);
    for (const step of Array.isArray(flow.steps) ? flow.steps : []) {
      if (typeof step.stepOrder !== "number") errors.push(`flows.${flow.tempId}.steps.${step.tempId}.stepOrder는 숫자여야 합니다.`);
      requireString(errors, `flows.${flow.tempId}.steps`, step.tempId, "actionDescription", step.actionDescription);
    }
  }
  for (const issue of analysis.issues) {
    requireOneOf(errors, "issues", issue.tempId, "issueType", issue.issueType, ISSUE_TYPES);
    requireOneOf(errors, "issues", issue.tempId, "severity", issue.severity, ISSUE_SEVERITIES);
    requireString(errors, "issues", issue.tempId, "title", issue.title);
    requireString(errors, "issues", issue.tempId, "description", issue.description);
  }
  for (const step of analysis.buildPlan) {
    requireString(errors, "buildPlan", step.tempId, "title", step.title);
    requireString(errors, "buildPlan", step.tempId, "description", step.description);
    requireOptionalStringArray(errors, "buildPlan", step.tempId, "includedScreenTempIds", step.includedScreenTempIds);
    requireOptionalStringArray(errors, "buildPlan", step.tempId, "includedDataObjectTempIds", step.includedDataObjectTempIds);
    requireOptionalStringArray(errors, "buildPlan", step.tempId, "excludedScope", step.excludedScope);
    requireOptionalStringArray(errors, "buildPlan", step.tempId, "completionCriteria", step.completionCriteria);
  }
}

function checkDuplicateTempIds(errors: string[], label: string, suggestions: AiSuggestionBase[]): void {
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    if (typeof suggestion.tempId !== "string" || suggestion.tempId.trim() === "") {
      errors.push(`${label}에 빈 tempId가 있습니다.`);
      continue;
    }
    if (seen.has(suggestion.tempId)) errors.push(`${label}에 중복 tempId가 있습니다: ${suggestion.tempId}`);
    seen.add(suggestion.tempId);
  }
}

function checkDuplicateNestedTempIds(errors: string[], label: string, suggestions: AiSuggestionBase[]): void {
  checkDuplicateTempIds(errors, label, suggestions);
}

function requireString(errors: string[], collection: string, tempId: string, field: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${collection}.${tempId}.${field}는 비어 있지 않은 문자열이어야 합니다.`);
  }
}

function requireOneOf(
  errors: string[],
  collection: string,
  tempId: string,
  field: string,
  value: unknown,
  allowedValues: readonly string[],
): void {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    errors.push(`${collection}.${tempId}.${field}는 허용된 값이어야 합니다.`);
  }
}

function requireOptionalStringArray(
  errors: string[],
  collection: string,
  tempId: string,
  field: string,
  value: unknown,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${collection}.${tempId}.${field}는 문자열 배열이어야 합니다.`);
  }
}

function checkConfidenceValues(errors: string[], analysis: AiAnalysisResult): void {
  const allSuggestions: AiSuggestionBase[] = [
    ...analysis.requirements,
    ...analysis.screens,
    ...analysis.features,
    ...analysis.dataObjects,
    ...analysis.dataRelations,
    ...analysis.roles,
    ...analysis.permissions,
    ...analysis.flows,
    ...analysis.issues,
    ...analysis.buildPlan,
    ...analysis.dataObjects.flatMap((object) => object.fields),
    ...analysis.flows.flatMap((flow) => flow.steps),
  ];

  for (const suggestion of allSuggestions) {
    if (!isValidConfidence(suggestion.confidence)) {
      errors.push(`${suggestion.tempId} confidence는 0 이상 1 이하 숫자여야 합니다.`);
    }
  }
}

function checkReferences(errors: string[], analysis: AiAnalysisResult): void {
  const screenTempIds = idSet(analysis.screens);
  const featureTempIds = idSet(analysis.features);
  const dataObjectTempIds = idSet(analysis.dataObjects);
  const roleTempIds = idSet(analysis.roles);

  for (const relation of analysis.dataRelations) {
    requireReference(errors, "dataRelations", relation.tempId, "sourceObjectTempId", relation.sourceObjectTempId, dataObjectTempIds);
    requireReference(errors, "dataRelations", relation.tempId, "targetObjectTempId", relation.targetObjectTempId, dataObjectTempIds);
  }

  for (const permission of analysis.permissions) {
    requireReference(errors, "permissions", permission.tempId, "roleTempId", permission.roleTempId, roleTempIds);
    if (permission.targetType === "screen") {
      requireOptionalReference(errors, "permissions", permission.tempId, "targetTempId", permission.targetTempId, screenTempIds);
    }
    if (permission.targetType === "feature") {
      requireOptionalReference(errors, "permissions", permission.tempId, "targetTempId", permission.targetTempId, featureTempIds);
    }
    if (permission.targetType === "dataObject") {
      requireOptionalReference(errors, "permissions", permission.tempId, "targetTempId", permission.targetTempId, dataObjectTempIds);
    }
  }

  for (const flow of analysis.flows) {
    requireOptionalReference(errors, "flows", flow.tempId, "primaryRoleTempId", flow.primaryRoleTempId, roleTempIds);
    checkFlowStepReferences(errors, flow, screenTempIds, dataObjectTempIds, featureTempIds);
  }

  for (const issue of analysis.issues) {
    requireOptionalReference(errors, "issues", issue.tempId, "relatedScreenTempId", issue.relatedScreenTempId, screenTempIds);
    requireOptionalReference(errors, "issues", issue.tempId, "relatedDataObjectTempId", issue.relatedDataObjectTempId, dataObjectTempIds);
    requireOptionalReference(errors, "issues", issue.tempId, "relatedFeatureTempId", issue.relatedFeatureTempId, featureTempIds);
  }
}

function checkFlowStepReferences(
  errors: string[],
  flow: AiFlowSuggestion,
  screenTempIds: Set<string>,
  dataObjectTempIds: Set<string>,
  featureTempIds: Set<string>,
): void {
  for (const step of flow.steps) {
    requireOptionalReference(errors, `flows.${flow.tempId}.steps`, step.tempId, "screenTempId", step.screenTempId, screenTempIds);
    requireOptionalReference(
      errors,
      `flows.${flow.tempId}.steps`,
      step.tempId,
      "dataObjectTempId",
      step.dataObjectTempId,
      dataObjectTempIds,
    );
    requireOptionalReference(errors, `flows.${flow.tempId}.steps`, step.tempId, "featureTempId", step.featureTempId, featureTempIds);
  }
}

function requireReference(
  errors: string[],
  collection: string,
  ownerTempId: string,
  field: string,
  referencedTempId: string,
  allowedIds: Set<string>,
): void {
  if (!allowedIds.has(referencedTempId)) {
    errors.push(`${collection}.${ownerTempId}.${field}가 존재하지 않는 tempId를 참조합니다: ${referencedTempId}`);
  }
}

function requireOptionalReference(
  errors: string[],
  collection: string,
  ownerTempId: string,
  field: string,
  referencedTempId: string | undefined,
  allowedIds: Set<string>,
): void {
  if (!referencedTempId) return;
  requireReference(errors, collection, ownerTempId, field, referencedTempId, allowedIds);
}

function idSet(suggestions: AiSuggestionBase[] | AiDataObjectSuggestion[]): Set<string> {
  return new Set(suggestions.map((suggestion) => suggestion.tempId));
}

function isValidConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
