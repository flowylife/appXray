import { getDefaultExportableObjects } from "../domain/status.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import type { SuggestionStatus } from "../domain/types.js";

export type ExportOptions = {
  includeStatuses?: SuggestionStatus[];
};

const DEFAULT_EXPORT_STATUSES: SuggestionStatus[] = ["accepted", "edited"];

export function exportProjectMarkdown(workspace: ProjectWorkspace, options: ExportOptions = {}): string {
  const screens = exportable(workspace.objects.screens, options);
  const dataObjects = exportable(workspace.objects.dataObjects, options);
  const flows = exportable(workspace.objects.flows, options);
  const issues = exportable(workspace.objects.issues, options);

  return [
    `# ${workspace.project.name}`,
    "",
    workspace.project.description ?? "No description.",
    "",
    "## App Map",
    ...screens.map((screen) => `- ${label(screen.displayName, screen.name)} (${screen.screenType})`),
    "",
    "## Data Map",
    ...dataObjects.map((object) => `- ${label(object.displayName, object.name)} (${object.objectType})`),
    "",
    "## User Flows",
    ...flows.map((flow) => `- ${flow.name}`),
    "",
    "## Missing Parts",
    ...issues.map((issue) => `- [${issue.severity}] ${issue.title}: ${issue.description}`),
    "",
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
