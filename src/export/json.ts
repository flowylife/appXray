import { exportable, type ExportOptions } from "./markdown.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { validateWorkspace } from "../domain/validation.js";

export function exportProjectJson(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const validation = validateWorkspace(workspace);
  return JSON.stringify(
    {
      schemaVersion: "1.0.0",
      exportMode: options?.exportMode ?? "confirmedOnly",
      project: workspace.project,
      sourceDocuments: workspace.sourceDocuments,
      objects: {
        requirements: exportable(workspace.objects.requirements, options),
        screens: exportable(workspace.objects.screens, options),
        features: exportable(workspace.objects.features, options),
        dataObjects: exportable(workspace.objects.dataObjects, options),
        dataFields: exportable(workspace.objects.dataFields, options),
        dataRelations: exportable(workspace.objects.dataRelations, options),
        roles: exportable(workspace.objects.roles, options),
        permissions: exportable(workspace.objects.permissions, options),
        flows: exportable(workspace.objects.flows, options),
        flowSteps: exportable(workspace.objects.flowSteps, options),
        issues: exportable(workspace.objects.issues, options),
      },
      ...(options?.includeValidationAppendix ? { validation } : {}),
    },
    null,
    2,
  );
}
