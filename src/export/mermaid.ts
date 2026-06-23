import { exportable, type ExportOptions } from "./markdown.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

export function exportAppMapMermaid(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const screens = exportable(workspace.objects.screens, options);
  const features = exportable(workspace.objects.features, options);
  const lines = ["flowchart LR"];

  for (const screen of screens) {
    lines.push(`  ${screen.id}["${escapeMermaid(screen.displayName ?? screen.name)}"]`);
  }
  for (const feature of features) {
    if (!feature.screenId) continue;
    if (!screens.some((screen) => screen.id === feature.screenId)) continue;
    lines.push(`  ${feature.screenId} --> ${feature.id}["${escapeMermaid(feature.name)}"]`);
  }

  return lines.join("\n");
}

export function exportDataMapMermaid(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const objects = exportable(workspace.objects.dataObjects, options);
  const relations = exportable(workspace.objects.dataRelations, options);
  const fields = exportable(workspace.objects.dataFields, options);
  const lines = ["erDiagram"];

  for (const object of objects) {
    const objectFields = fields.filter((field) => field.dataObjectId === object.id);
    lines.push(`  ${object.name} {`);
    for (const field of objectFields) {
      lines.push(`    ${field.fieldType} ${field.name}`);
    }
    lines.push("  }");
  }

  for (const relation of relations) {
    const source = objects.find((object) => object.id === relation.sourceObjectId);
    const target = objects.find((object) => object.id === relation.targetObjectId);
    if (!source || !target) continue;
    lines.push(`  ${source.name} ||--o{ ${target.name} : "${escapeMermaid(relation.relationType)}"`);
  }

  return lines.join("\n");
}

function escapeMermaid(value: string): string {
  return value.replaceAll('"', "'");
}
