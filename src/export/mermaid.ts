import { exportable, type ExportOptions } from "./markdown.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

export function exportAppMapMermaid(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const screens = exportable(workspace.objects.screens, options);
  const features = exportable(workspace.objects.features, options);
  const lines = ["flowchart LR"];

  if (options?.exportMode === "auditTrail") {
    lines.push("  %% Audit trail export: nodes include review status and may be unconfirmed.");
  }
  if (screens.length === 0) {
    lines.push("  %% No confirmed screens to export.");
  }
  for (const screen of screens) {
    lines.push(`  ${screen.id}["${escapeMermaid(labelWithStatus(screen.displayName ?? screen.name, screen.status, options))}"]`);
  }
  for (const feature of features) {
    if (!feature.screenId) continue;
    if (!screens.some((screen) => screen.id === feature.screenId)) continue;
    lines.push(`  ${feature.screenId} --> ${feature.id}["${escapeMermaid(labelWithStatus(feature.name, feature.status, options))}"]`);
  }

  return lines.join("\n");
}

export function exportDataMapMermaid(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const objects = exportable(workspace.objects.dataObjects, options);
  const relations = exportable(workspace.objects.dataRelations, options);
  const fields = exportable(workspace.objects.dataFields, options);
  const lines = ["erDiagram"];

  if (options?.exportMode === "auditTrail") {
    lines.push("  %% Audit trail export: entities and relations include review status and may be unconfirmed.");
  }
  if (objects.length === 0) {
    lines.push("  %% No confirmed data objects to export.");
  }
  for (const object of objects) {
    const objectFields = fields.filter((field) => field.dataObjectId === object.id);
    lines.push(`  ${object.name} {`);
    if (options?.exportMode === "auditTrail") {
      lines.push(`    string review_status "${escapeMermaid(object.status)}"`);
    }
    for (const field of objectFields) {
      lines.push(`    ${field.fieldType} ${field.name}`);
    }
    lines.push("  }");
  }

  for (const relation of relations) {
    const source = objects.find((object) => object.id === relation.sourceObjectId);
    const target = objects.find((object) => object.id === relation.targetObjectId);
    if (!source || !target) continue;
    lines.push(`  ${source.name} ||--o{ ${target.name} : "${escapeMermaid(labelWithStatus(relation.relationType, relation.status, options))}"`);
  }

  return lines.join("\n");
}

function escapeMermaid(value: string): string {
  return value.replaceAll('"', "'");
}

function labelWithStatus(value: string, status: string, options?: ExportOptions): string {
  if (options?.exportMode !== "auditTrail") return value;
  return `${value} [${status}]`;
}
