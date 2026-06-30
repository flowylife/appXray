import type { ProjectWorkspace } from "../domain/workspace.js";
import { exportable, stableExportOrder, type ExportOptions } from "./markdown.js";

const DATA_OBJECT_HEADERS = [
  "id",
  "status",
  "name",
  "displayName",
  "objectType",
  "description",
  "fieldCount",
  "relationCount",
] as const;

const ISSUE_HEADERS = [
  "id",
  "status",
  "severity",
  "issueType",
  "title",
  "description",
  "suggestion",
  "resolutionNote",
  "includeInPrompt",
  "relatedScreenId",
  "relatedDataObjectId",
  "relatedFeatureId",
] as const;

export function exportDataObjectsCsv(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const dataObjects = exportable(workspace.objects.dataObjects, options);
  const fields = exportable(workspace.objects.dataFields, options);
  const relations = exportable(workspace.objects.dataRelations, options);
  const rows = dataObjects.map((object) => ({
    id: object.id,
    status: object.status,
    name: object.name,
    displayName: object.displayName ?? "",
    objectType: object.objectType,
    description: object.description ?? "",
    fieldCount: String(fields.filter((field) => field.dataObjectId === object.id).length),
    relationCount: String(
      relations.filter((relation) => relation.sourceObjectId === object.id || relation.targetObjectId === object.id).length,
    ),
  }));

  return renderCsv(DATA_OBJECT_HEADERS, rows);
}

export function exportIssuesCsv(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const rows = exportable(workspace.objects.issues, options).map((issue) => ({
    id: issue.id,
    status: issue.status,
    severity: issue.severity,
    issueType: issue.issueType,
    title: issue.title,
    description: issue.description,
    suggestion: issue.suggestion ?? "",
    resolutionNote: issue.resolutionNote ?? "",
    includeInPrompt: issue.includeInPrompt === undefined ? "" : String(issue.includeInPrompt),
    relatedScreenId: issue.relatedScreenId ?? "",
    relatedDataObjectId: issue.relatedDataObjectId ?? "",
    relatedFeatureId: issue.relatedFeatureId ?? "",
  }));

  return renderCsv(ISSUE_HEADERS, rows);
}

function renderCsv<THeader extends string>(
  headers: readonly THeader[],
  rows: ReadonlyArray<Record<THeader, string>>,
): string {
  return [
    headers.join(","),
    ...stableExportOrder(rows).map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ].join("\n");
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
