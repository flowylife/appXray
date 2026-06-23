import type { ProjectWorkspace } from "../domain/workspace.js";
import type { SuggestionStatus } from "../domain/types.js";
import { exportProjectJson } from "./json.js";
import { exportProjectMarkdown } from "./markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "./mermaid.js";
import { createBuildPrompt } from "../prompt/build-prompt.js";
import { exportGithubIssuesMarkdown } from "./github-issues.js";

export type ExportType =
  | "markdown"
  | "appMermaid"
  | "dataMermaid"
  | "json"
  | "codexPrompt"
  | "cursorPrompt"
  | "githubIssues"
  | "bundle";

export type ExportMode = "confirmedOnly" | "auditTrail";

export type ExportContentOptions = {
  mode?: ExportMode;
  includeValidationAppendix?: boolean;
};

export type ExportBundleFile = {
  fileName: string;
  exportType: Exclude<ExportType, "bundle">;
  content: string;
};

export function getExportContent(workspace: ProjectWorkspace, type: ExportType, options: ExportContentOptions = {}): string {
  const exportOptions = toExportOptions(options);
  if (type === "markdown") return exportProjectMarkdown(workspace, exportOptions);
  if (type === "appMermaid") return exportAppMapMermaid(workspace, exportOptions);
  if (type === "dataMermaid") return exportDataMapMermaid(workspace, exportOptions);
  if (type === "json") return exportProjectJson(workspace, exportOptions);
  if (type === "codexPrompt") return createBuildPrompt(workspace, { targetTool: "codex" });
  if (type === "cursorPrompt") return createBuildPrompt(workspace, { targetTool: "cursor" });
  if (type === "githubIssues") return exportGithubIssuesMarkdown(workspace, exportOptions);
  return JSON.stringify(createExportBundle(workspace, options), null, 2);
}

export function getExportFileName(workspace: ProjectWorkspace, type: ExportType): string {
  const projectSlug = sanitizeFilePart(workspace.project.name);
  if (type === "markdown") return `app-xray-${projectSlug}.md`;
  if (type === "appMermaid") return `app-xray-${projectSlug}-app-map.mmd`;
  if (type === "dataMermaid") return `app-xray-${projectSlug}-data-map.mmd`;
  if (type === "json") return `app-xray-${projectSlug}.json`;
  if (type === "codexPrompt") return `app-xray-${projectSlug}-codex.md`;
  if (type === "cursorPrompt") return `app-xray-${projectSlug}-cursor.md`;
  if (type === "githubIssues") return `app-xray-${projectSlug}-github-issues.md`;
  return `app-xray-${projectSlug}-bundle.json`;
}

export function createExportBundle(workspace: ProjectWorkspace, options: ExportContentOptions = {}): { projectId: string; mode: ExportMode; files: ExportBundleFile[] } {
  const exportTypes: Exclude<ExportType, "bundle">[] = [
    "markdown",
    "appMermaid",
    "dataMermaid",
    "json",
    "codexPrompt",
    "cursorPrompt",
    "githubIssues",
  ];

  return {
    projectId: workspace.project.id,
    mode: options.mode ?? "confirmedOnly",
    files: exportTypes.map((exportType) => ({
      fileName: getExportFileName(workspace, exportType),
      exportType,
      content: getExportContent(workspace, exportType, options),
    })),
  };
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

function toExportOptions(options: ExportContentOptions): {
  includeStatuses?: SuggestionStatus[];
  exportMode?: ExportMode;
  includeValidationAppendix?: boolean | undefined;
} {
  if (options.mode === "auditTrail") {
    return {
      includeStatuses: ["suggested", "accepted", "edited", "rejected", "deferred"],
      exportMode: "auditTrail",
      includeValidationAppendix: options.includeValidationAppendix,
    };
  }
  return {
    exportMode: "confirmedOnly",
    includeValidationAppendix: options.includeValidationAppendix,
  };
}
