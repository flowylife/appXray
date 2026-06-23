import { getDefaultExportableObjects } from "../domain/status.js";
import { validateWorkspace } from "../domain/validation.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import type { DataObject, SuggestionStatus } from "../domain/types.js";
import type { ExportMode } from "./export-content.js";

export type ExportOptions = {
  includeStatuses?: SuggestionStatus[];
  exportMode?: ExportMode;
  includeValidationAppendix?: boolean | undefined;
};

const DEFAULT_EXPORT_STATUSES: SuggestionStatus[] = ["accepted", "edited"];

export function exportProjectMarkdown(workspace: ProjectWorkspace, options: ExportOptions = {}): string {
  const requirements = exportable(workspace.objects.requirements, options);
  const screens = exportable(workspace.objects.screens, options);
  const features = exportable(workspace.objects.features, options);
  const dataObjects = exportable(workspace.objects.dataObjects, options);
  const dataFields = exportable(workspace.objects.dataFields, options);
  const dataRelations = exportable(workspace.objects.dataRelations, options);
  const roles = exportable(workspace.objects.roles, options);
  const permissions = exportable(workspace.objects.permissions, options);
  const flows = exportable(workspace.objects.flows, options);
  const flowSteps = exportable(workspace.objects.flowSteps, options);
  const issues = exportable(workspace.objects.issues, options);
  const validation = validateWorkspace(workspace);

  return [
    `# ${workspace.project.name}`,
    "",
    `Export mode: ${options.exportMode ?? "confirmedOnly"}`,
    "",
    workspace.project.description ?? "No description.",
    "",
    "## Requirements",
    ...emptyAware(requirements.map((requirement) => `- [${requirement.requirementType}] ${requirement.text}`)),
    "",
    "## App Map",
    ...emptyAware(
      screens.map((screen) => {
        const screenFeatures = features.filter((feature) => feature.screenId === screen.id);
        return [
          `- ${label(screen.displayName, screen.name)} (${screen.screenType})`,
          ...screenFeatures.map((feature) => `  - ${feature.name}: ${feature.description ?? feature.actionType}`),
        ].join("\n");
      }),
    ),
    "",
    "## Data Map",
    ...emptyAware(
      dataObjects.map((object) =>
        [
          `- ${label(object.displayName, object.name)} (${object.objectType})`,
          ...dataFields
            .filter((field) => field.dataObjectId === object.id)
            .map((field) => `  - ${field.name}: ${field.fieldType}${field.required ? " required" : ""}`),
          ...dataRelations
            .filter((relation) => relation.sourceObjectId === object.id && hasConfirmedTarget(dataObjects, relation.targetObjectId))
            .map((relation) => `  - ${relation.relationType} -> ${objectName(dataObjects, relation.targetObjectId)}`),
        ].join("\n"),
      ),
    ),
    "",
    "## Roles and Permissions",
    ...emptyAware(
      roles.map((role) =>
        [
          `- ${label(role.displayName, role.name)}`,
          ...permissions
            .filter((permission) => permission.roleId === role.id)
            .map((permission) => `  - ${permission.allowed ? "allow" : "deny"} ${permission.action} ${permission.targetType}`),
        ].join("\n"),
      ),
    ),
    "",
    "## User Flows",
    ...emptyAware(
      flows.map((flow) =>
        [
          `- ${flow.name}: ${flow.description ?? "No description"}`,
          ...flowSteps
            .filter((step) => step.flowId === flow.id)
            .sort((a, b) => a.stepOrder - b.stepOrder)
            .map((step) => `  ${step.stepOrder}. ${step.actionDescription}`),
        ].join("\n"),
      ),
    ),
    "",
    "## Missing Parts",
    ...emptyAware(
      issues.map((issue) =>
        [
          `- [${issue.severity}] ${issue.title}: ${issue.description}`,
          issue.suggestion ? `  - Suggested decision: ${issue.suggestion}` : undefined,
          issue.resolutionNote ? `  - User note: ${issue.resolutionNote}` : undefined,
        ].filter(Boolean).join("\n"),
      ),
    ),
    "",
    ...(options.includeValidationAppendix ? [
      "## Export Validation",
      ...emptyAware([
        ...validation.errors.map((issue) => `- ERROR: ${issue.message}`),
        ...validation.warnings.map((issue) => `- WARNING: ${issue.message}`),
      ]),
      "",
    ] : []),
  ].join("\n");
}

export function exportable<T extends { status: SuggestionStatus }>(
  objects: readonly T[],
  options: ExportOptions = {},
): T[] {
  const statuses = options.includeStatuses ?? DEFAULT_EXPORT_STATUSES;
  if (statuses.length === 2 && statuses.includes("accepted") && statuses.includes("edited")) {
    return getDefaultExportableObjects(objects as readonly (T & { id: string; projectId: string; createdAt: string; updatedAt: string })[]);
  }
  return objects.filter((object) => statuses.includes(object.status));
}

function label(displayName: string | undefined, name: string): string {
  return displayName ? `${displayName} / ${name}` : name;
}

function emptyAware(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None"];
}

function hasConfirmedTarget(objects: DataObject[], targetObjectId: string): boolean {
  return objects.some((object) => object.id === targetObjectId);
}

function objectName(objects: DataObject[], objectId: string): string {
  const object = objects.find((candidate) => candidate.id === objectId);
  return object?.displayName ?? object?.name ?? objectId;
}
