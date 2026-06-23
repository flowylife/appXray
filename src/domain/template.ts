import { mergeAiSuggestionsPreservingConfirmed } from "./lifecycle.js";
import { createEmptySuggestionSet } from "./workspace.js";
import type {
  ActionType,
  DataFieldType,
  DataObjectType,
  DataRelation,
  Flow,
  FlowStep,
  Issue,
  IssueType,
  Permission,
  PermissionAction,
  PermissionTargetType,
  Project,
  RelationType,
  Requirement,
  RequirementType,
  Screen,
  ScreenType,
  UserRole,
  XraySuggestionSet,
} from "./types.js";
import type { ProjectWorkspace } from "./workspace.js";

export type TemplateManifest = {
  schemaVersion: string;
  templateId: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  appTypes: string[];
  targetUsers: string[];
  screens: TemplateScreen[];
  dataObjects: TemplateDataObject[];
  dataRelations: TemplateDataRelation[];
  roles: TemplateRole[];
  permissions: TemplatePermission[];
  flows: TemplateFlow[];
  issues: TemplateIssue[];
  promptPacks: TemplatePromptPack[];
  exports?: TemplateExportPreset[];
};

export type TemplateScreen = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  screenType: ScreenType;
  parentId?: string;
};

export type TemplateDataObject = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  objectType: DataObjectType;
  fields: TemplateDataField[];
};

export type TemplateDataField = {
  id: string;
  name: string;
  displayName?: string;
  fieldType: DataFieldType;
  required?: boolean;
  enumValues?: string[];
  description?: string;
};

export type TemplateDataRelation = {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationType: RelationType;
  description?: string;
};

export type TemplateRole = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
};

export type TemplatePermission = {
  id: string;
  roleId: string;
  targetType: PermissionTargetType;
  targetId?: string;
  action: PermissionAction;
  allowed: boolean;
};

export type TemplateFlow = {
  id: string;
  name: string;
  description?: string;
  primaryRoleId?: string;
  steps: TemplateFlowStep[];
};

export type TemplateFlowStep = {
  id: string;
  stepOrder: number;
  screenId?: string;
  actionDescription: string;
  dataObjectId?: string;
};

export type TemplateIssue = {
  id: string;
  issueType: IssueType;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggestion?: string;
};

export type TemplatePromptPack = {
  id: string;
  targetTool: string;
  title: string;
  prompt: string;
};

export type TemplateExportPreset = {
  id: string;
  type: "markdown" | "mermaid" | "json" | "prompt";
  title: string;
};

export type TemplateValidationIssue = {
  code: string;
  message: string;
  templateObjectId?: string;
};

export type TemplateValidationReport = {
  errors: TemplateValidationIssue[];
  warnings: TemplateValidationIssue[];
  isValid: boolean;
};

export function validateTemplateManifest(template: TemplateManifest): TemplateValidationReport {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const screenIds = new Set(template.screens.map((screen) => screen.id));
  const dataObjectIds = new Set(template.dataObjects.map((object) => object.id));
  const roleIds = new Set(template.roles.map((role) => role.id));

  if (!template.templateId || !template.version) {
    errors.push({ code: "missing_template_identity", message: "템플릿 ID와 버전이 필요합니다." });
  }
  if (template.screens.length === 0) warnings.push({ code: "no_template_screens", message: "템플릿에 화면이 없습니다." });
  if (template.dataObjects.length === 0) warnings.push({ code: "no_template_data", message: "템플릿에 저장할 정보가 없습니다." });

  for (const relation of template.dataRelations) {
    if (!dataObjectIds.has(relation.sourceObjectId) || !dataObjectIds.has(relation.targetObjectId)) {
      errors.push({
        code: "broken_template_relation",
        message: "템플릿 정보 연결이 존재하지 않는 저장 정보를 참조합니다.",
        templateObjectId: relation.id,
      });
    }
  }
  for (const permission of template.permissions) {
    if (!roleIds.has(permission.roleId)) {
      errors.push({ code: "broken_template_permission", message: "템플릿 권한이 존재하지 않는 역할을 참조합니다.", templateObjectId: permission.id });
    }
  }
  for (const flow of template.flows) {
    for (const step of flow.steps) {
      if (step.screenId && !screenIds.has(step.screenId)) {
        errors.push({ code: "broken_template_flow_step", message: "템플릿 사용 흐름이 존재하지 않는 화면을 참조합니다.", templateObjectId: step.id });
      }
    }
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

export function applyTemplateToWorkspace(
  workspace: ProjectWorkspace,
  template: TemplateManifest,
  now = new Date().toISOString(),
): { workspace: ProjectWorkspace; validation: TemplateValidationReport } {
  const validation = validateTemplateManifest(template);
  if (!validation.isValid) return { workspace, validation };

  const suggestions = templateToSuggestionSet(workspace.project, template, now);
  const mergedObjects = mergeAiSuggestionsPreservingConfirmed(workspace.objects, suggestions);

  return {
    validation,
    workspace: {
      ...workspace,
      objects: mergedObjects,
      appliedTemplates: [
        {
          templateId: template.templateId,
          name: template.name,
          version: template.version,
          appliedAt: now,
          warningCount: validation.warnings.length,
        },
        ...(workspace.appliedTemplates ?? []),
      ],
      updatedAt: now,
    },
  };
}

export function templateToSuggestionSet(project: Project, template: TemplateManifest, now: string): XraySuggestionSet {
  const objects = createEmptySuggestionSet();
  const screenId = (id: string) => stableId(template, "screen", id);
  const dataObjectId = (id: string) => stableId(template, "dataObject", id);
  const roleId = (id: string) => stableId(template, "role", id);
  const flowId = (id: string) => stableId(template, "flow", id);

  objects.requirements = template.promptPacks.map((pack): Requirement => ({
    ...base(project, template, "requirement", pack.id, now),
    sourceDocumentId: "",
    text: pack.title,
    requirementType: "unknown" satisfies RequirementType,
  }));

  objects.screens = template.screens.map((screen, index): Screen => ({
    ...base(project, template, "screen", screen.id, now),
    name: screen.name,
    ...optional("displayName", screen.displayName),
    ...optional("description", screen.description),
    screenType: screen.screenType,
    ...optional("parentScreenId", screen.parentId ? screenId(screen.parentId) : undefined),
    orderIndex: index,
  }));

  objects.dataObjects = template.dataObjects.map((object) => ({
    ...base(project, template, "dataObject", object.id, now),
    name: object.name,
    ...optional("displayName", object.displayName),
    ...optional("description", object.description),
    objectType: object.objectType,
  }));

  objects.dataFields = template.dataObjects.flatMap((object) =>
    object.fields.map((field) => ({
      ...base(project, template, "dataField", `${object.id}_${field.id}`, now),
      dataObjectId: dataObjectId(object.id),
      name: field.name,
      ...optional("displayName", field.displayName),
      fieldType: field.fieldType,
      ...optional("required", field.required),
      ...optional("enumValues", field.enumValues),
      ...optional("description", field.description),
    })),
  );

  objects.dataRelations = template.dataRelations.map((relation): DataRelation => ({
    ...base(project, template, "dataRelation", relation.id, now),
    sourceObjectId: dataObjectId(relation.sourceObjectId),
    targetObjectId: dataObjectId(relation.targetObjectId),
    relationType: relation.relationType,
    ...optional("description", relation.description),
  }));

  objects.roles = template.roles.map((role): UserRole => ({
    ...base(project, template, "role", role.id, now),
    name: role.name,
    ...optional("displayName", role.displayName),
    ...optional("description", role.description),
  }));

  objects.permissions = template.permissions.map((permission): Permission => ({
    ...base(project, template, "permission", permission.id, now),
    roleId: roleId(permission.roleId),
    targetType: permission.targetType,
    ...optional("targetId", resolveTemplateTarget(template, permission)),
    action: permission.action,
    allowed: permission.allowed,
  }));

  objects.flows = template.flows.map((flow): Flow => ({
    ...base(project, template, "flow", flow.id, now),
    name: flow.name,
    ...optional("description", flow.description),
    ...optional("primaryRoleId", flow.primaryRoleId ? roleId(flow.primaryRoleId) : undefined),
  }));

  objects.flowSteps = template.flows.flatMap((flow) =>
    flow.steps.map((step): FlowStep => ({
      ...base(project, template, "flowStep", `${flow.id}_${step.id}`, now),
      flowId: flowId(flow.id),
      stepOrder: step.stepOrder,
      ...optional("screenId", step.screenId ? screenId(step.screenId) : undefined),
      ...optional("dataObjectId", step.dataObjectId ? dataObjectId(step.dataObjectId) : undefined),
      actionDescription: step.actionDescription,
    })),
  );

  objects.issues = template.issues.map((issue): Issue => ({
    ...base(project, template, "issue", issue.id, now),
    issueType: issue.issueType,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    ...optional("suggestion", issue.suggestion),
  }));

  return objects;
}

function resolveTemplateTarget(template: TemplateManifest, permission: TemplatePermission): string | undefined {
  if (!permission.targetId) return undefined;
  if (permission.targetType === "screen") return stableId(template, "screen", permission.targetId);
  if (permission.targetType === "dataObject") return stableId(template, "dataObject", permission.targetId);
  return permission.targetId;
}

function base(project: Project, template: TemplateManifest, kind: string, id: string, now: string) {
  return {
    id: stableId(template, kind, id),
    projectId: project.id,
    status: "suggested" as const,
    origin: {
      kind: "template" as const,
      tempId: `${template.templateId}:${kind}:${id}`,
      templateId: template.templateId,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function stableId(template: TemplateManifest, kind: string, id: string): string {
  return `tpl_${template.slug}_${kind}_${id}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}
