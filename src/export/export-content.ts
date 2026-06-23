import type { ProjectWorkspace } from "../domain/workspace.js";
import { exportProjectJson } from "./json.js";
import { exportProjectMarkdown } from "./markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "./mermaid.js";

export type ExportType = "markdown" | "appMermaid" | "dataMermaid" | "json";

export function getExportContent(workspace: ProjectWorkspace, type: ExportType): string {
  if (type === "markdown") return exportProjectMarkdown(workspace);
  if (type === "appMermaid") return exportAppMapMermaid(workspace);
  if (type === "dataMermaid") return exportDataMapMermaid(workspace);
  return exportProjectJson(workspace);
}

export function getExportFileName(workspace: ProjectWorkspace, type: ExportType): string {
  const projectSlug = sanitizeFilePart(workspace.project.name);
  if (type === "markdown") return `app-xray-${projectSlug}.md`;
  if (type === "appMermaid") return `app-xray-${projectSlug}-app-map.mmd`;
  if (type === "dataMermaid") return `app-xray-${projectSlug}-data-map.mmd`;
  return `app-xray-${projectSlug}.json`;
}

export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilePart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "project";
}
