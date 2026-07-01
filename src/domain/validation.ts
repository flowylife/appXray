import { getDefaultExportableObjects, isConfirmedXrayObject } from "./status.js";
import type { BaseXrayObject, DataObject, Screen, XraySuggestionSet } from "./types.js";
import type { ProjectWorkspace, XraySuggestionBucket } from "./workspace.js";

export type ValidationSeverity = "error" | "warning";
export type ValidationSuggestedAction =
  | "review_target"
  | "remove_broken_relation"
  | "mark_duplicate_deferred"
  | "exclude_issue_from_prompt";

export type ValidationIssue = {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  targetId?: string;
  targetBucket?: XraySuggestionBucket;
  suggestedAction?: ValidationSuggestedAction;
  relatedObjectId?: string;
  relatedBucket?: XraySuggestionBucket;
};

export type ValidationReport = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  isExportSafe: boolean;
};

export function validateWorkspace(workspace: ProjectWorkspace): ValidationReport {
  const issues: ValidationIssue[] = [
    ...validateScreenNames(workspace.objects),
    ...validateDataObjectNames(workspace.objects),
    ...validateDuplicateNames("screens", getDefaultExportableObjects(workspace.objects.screens), "화면 이름이 겹칩니다."),
    ...validateDuplicateNames(
      "dataObjects",
      getDefaultExportableObjects(workspace.objects.dataObjects),
      "앱이 저장할 정보 이름이 겹칩니다.",
    ),
    ...validateConfirmedDataObjectsHaveFields(workspace.objects),
    ...validateConfirmedDataFieldsHaveDataObjects(workspace.objects),
    ...validateDataRelations(workspace.objects),
    ...validateConfirmedScreensHaveFeatures(workspace.objects),
    ...validateConfirmedFlows(workspace.objects),
    ...validateDefaultExportScope(workspace.objects),
    ...validateHighSeverityIssues(workspace.objects),
    ...validateMinimumExportShape(workspace.objects),
  ];
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    errors,
    warnings,
    isExportSafe: errors.length === 0,
  };
}

function validateScreenNames(objects: XraySuggestionSet): ValidationIssue[] {
  return getDefaultExportableObjects(objects.screens)
    .filter((screen) => normalizedName(screen) === "")
    .map((screen) => ({
      id: `empty-screen-name-${screen.id}`,
      severity: "error",
      code: "empty_screen_name",
      message: "내보내기 전에 고칠 것: 이름이 비어 있는 화면이 있습니다.",
      relatedObjectId: screen.id,
      relatedBucket: "screens",
      targetId: screen.id,
      targetBucket: "screens",
      suggestedAction: "review_target",
    }));
}

function validateDataObjectNames(objects: XraySuggestionSet): ValidationIssue[] {
  return getDefaultExportableObjects(objects.dataObjects)
    .filter((object) => normalizedName(object) === "")
    .map((object) => ({
      id: `empty-data-object-name-${object.id}`,
      severity: "error",
      code: "empty_object_name",
      message: "내보내기 전에 고칠 것: 이름이 비어 있는 앱이 저장할 정보가 있습니다.",
      relatedObjectId: object.id,
      relatedBucket: "dataObjects",
      targetId: object.id,
      targetBucket: "dataObjects",
      suggestedAction: "review_target",
    }));
}

function validateDuplicateNames<T extends Screen | DataObject>(
  bucket: XraySuggestionBucket,
  objects: T[],
  message: string,
): ValidationIssue[] {
  const seen = new Map<string, T>();
  const issues: ValidationIssue[] = [];

  for (const object of objects) {
    const key = normalizedName(object);
    if (!key) continue;
    const existing = seen.get(key);
    if (existing) {
      issues.push({
        id: `duplicate-${bucket}-${key}-${object.id}`,
        severity: "error",
        code: "duplicate_name",
        message: `내보내기 전에 고칠 것: ${message}`,
        relatedObjectId: object.id,
        relatedBucket: bucket,
        targetId: object.id,
        targetBucket: bucket,
        suggestedAction: "mark_duplicate_deferred",
      });
      continue;
    }
    seen.set(key, object);
  }

  return issues;
}

function validateConfirmedDataObjectsHaveFields(objects: XraySuggestionSet): ValidationIssue[] {
  const confirmedFields = getDefaultExportableObjects(objects.dataFields);
  return getDefaultExportableObjects(objects.dataObjects)
    .filter((object) => !confirmedFields.some((field) => field.dataObjectId === object.id))
    .map((object) => ({
      id: `data-object-without-fields-${object.id}`,
      severity: "warning",
      code: "data_object_without_fields",
      message: "확인 필요: 앱이 저장할 정보에 확정된 필드가 없습니다.",
      relatedObjectId: object.id,
      relatedBucket: "dataObjects",
      targetId: object.id,
      targetBucket: "dataObjects",
      suggestedAction: "review_target",
    }));
}

function validateConfirmedDataFieldsHaveDataObjects(objects: XraySuggestionSet): ValidationIssue[] {
  const allObjectIds = new Set(objects.dataObjects.map((object) => object.id));
  const confirmedObjectIds = new Set(getDefaultExportableObjects(objects.dataObjects).map((object) => object.id));

  return getDefaultExportableObjects(objects.dataFields).flatMap((field) => {
    if (confirmedObjectIds.has(field.dataObjectId)) return [];
    const target = {
      relatedObjectId: field.id,
      relatedBucket: "dataFields" as const,
      targetId: field.id,
      targetBucket: "dataFields" as const,
      suggestedAction: "review_target" as const,
    };
    if (allObjectIds.has(field.dataObjectId)) {
      return [
        {
          id: `non-confirmed-field-parent-${field.id}`,
          severity: "error" as const,
          code: "non_confirmed_export",
          message: "내보내기 전에 고칠 것: 확정된 항목이 확정되지 않은 정보 구조를 참조합니다.",
          ...target,
        },
      ];
    }
    return [
      {
        id: `orphan-field-${field.id}`,
        severity: "error" as const,
        code: "orphan_field",
        message: "내보내기 전에 고칠 것: 연결할 앱 정보가 없는 확정 필드가 있습니다.",
        ...target,
      },
    ];
  });
}

function validateDataRelations(objects: XraySuggestionSet): ValidationIssue[] {
  const confirmedObjects = getDefaultExportableObjects(objects.dataObjects);
  const objectIds = new Set(confirmedObjects.map((object) => object.id));

  return getDefaultExportableObjects(objects.dataRelations).flatMap((relation) => {
    const missing: ValidationIssue[] = [];
    if (!objectIds.has(relation.sourceObjectId)) {
      missing.push({
        id: `broken-relation-source-${relation.id}`,
        severity: "error",
        code: "broken_relation",
        message: "내보내기 전에 고칠 것: 연결이 끊긴 정보 구조 관계가 있습니다.",
        relatedObjectId: relation.id,
        relatedBucket: "dataRelations",
        targetId: relation.id,
        targetBucket: "dataRelations",
        suggestedAction: "remove_broken_relation",
      });
    }
    if (!objectIds.has(relation.targetObjectId)) {
      missing.push({
        id: `broken-relation-target-${relation.id}`,
        severity: "error",
        code: "broken_relation",
        message: "내보내기 전에 고칠 것: 연결이 끊긴 정보 구조 관계가 있습니다.",
        relatedObjectId: relation.id,
        relatedBucket: "dataRelations",
        targetId: relation.id,
        targetBucket: "dataRelations",
        suggestedAction: "remove_broken_relation",
      });
    }
    return missing;
  });
}

function validateConfirmedScreensHaveFeatures(objects: XraySuggestionSet): ValidationIssue[] {
  const confirmedFeatures = getDefaultExportableObjects(objects.features);
  return getDefaultExportableObjects(objects.screens)
    .filter((screen) => !confirmedFeatures.some((feature) => feature.screenId === screen.id))
    .map((screen) => ({
      id: `screen-without-features-${screen.id}`,
      severity: "warning",
      code: "screen_without_features",
      message: "확인 필요: 확정된 화면에 연결된 확정 기능이 없습니다.",
      relatedObjectId: screen.id,
      relatedBucket: "screens",
      targetId: screen.id,
      targetBucket: "screens",
      suggestedAction: "review_target",
    }));
}

function validateConfirmedFlows(objects: XraySuggestionSet): ValidationIssue[] {
  const confirmedSteps = getDefaultExportableObjects(objects.flowSteps);
  return getDefaultExportableObjects(objects.flows)
    .filter((flow) => confirmedSteps.filter((step) => step.flowId === flow.id).length < 2)
    .map((flow) => ({
      id: `flow-without-steps-${flow.id}`,
      severity: "error",
      code: "flow_without_steps",
      message: "내보내기 전에 고칠 것: 사용 흐름에는 확정된 단계가 2개 이상 필요합니다.",
      relatedObjectId: flow.id,
      relatedBucket: "flows",
      targetId: flow.id,
      targetBucket: "flows",
      suggestedAction: "review_target",
    }));
}

function validateDefaultExportScope(objects: XraySuggestionSet): ValidationIssue[] {
  const exportableCollections = Object.values(objects).flatMap((collection) =>
    getDefaultExportableObjects(collection as BaseXrayObject[]),
  ) as BaseXrayObject[];

  return exportableCollections
    .filter((object) => !isConfirmedXrayObject(object))
    .map((object) => ({
      id: `non-confirmed-export-${object.id}`,
      severity: "error",
      code: "non_confirmed_export",
      message: "내보내기 전에 고칠 것: 확정되지 않은 항목이 기본 export 대상에 포함되었습니다.",
      relatedObjectId: object.id,
      targetId: object.id,
      suggestedAction: "review_target",
    }));
}

function validateHighSeverityIssues(objects: XraySuggestionSet): ValidationIssue[] {
  return getDefaultExportableObjects(objects.issues)
    .filter((issue) => issue.severity === "high" && issue.includeInPrompt !== false)
    .map((issue) => ({
      id: `high-severity-issue-${issue.id}`,
      severity: "warning",
      code: "high_severity_issue",
      message: "확인 필요: 중요한 결정 필요 항목이 아직 남아 있습니다.",
      relatedObjectId: issue.id,
      relatedBucket: "issues",
      targetId: issue.id,
      targetBucket: "issues",
      suggestedAction: "exclude_issue_from_prompt",
    }));
}

function validateMinimumExportShape(objects: XraySuggestionSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (getDefaultExportableObjects(objects.screens).length === 0) {
    issues.push({
      id: "no-confirmed-screens",
      severity: "warning",
      code: "no_confirmed_screens",
      message: "확인 필요: 확정된 화면이 없습니다.",
      relatedBucket: "screens",
      targetBucket: "screens",
      suggestedAction: "review_target",
    });
  }
  if (getDefaultExportableObjects(objects.dataObjects).length === 0) {
    issues.push({
      id: "no-confirmed-data-objects",
      severity: "warning",
      code: "no_confirmed_data_objects",
      message: "확인 필요: 확정된 앱이 저장할 정보가 없습니다.",
      relatedBucket: "dataObjects",
      targetBucket: "dataObjects",
      suggestedAction: "review_target",
    });
  }
  return issues;
}

function normalizedName(object: Screen | DataObject): string {
  return (object.displayName ?? object.name).trim().toLowerCase();
}
