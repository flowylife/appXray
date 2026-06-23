import { exportable, type ExportOptions } from "./markdown.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

export function exportProjectJson(workspace: ProjectWorkspace, options?: ExportOptions): string {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
}
