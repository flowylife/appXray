import type { ProjectWorkspace } from "../domain/workspace.js";
import type { SuggestionStatus } from "../domain/types.js";
import { exportProjectJson } from "./json.js";
import { exportProjectMarkdown } from "./markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "./mermaid.js";
import { createBuildPrompt } from "../prompt/build-prompt.js";
import { exportGithubIssuesMarkdown } from "./github-issues.js";
import { exportDataObjectsCsv, exportIssuesCsv } from "./csv.js";
import { validateWorkspace } from "../domain/validation.js";

const APP_VERSION = "0.0.0";

export type ExportType =
  | "markdown"
  | "appMermaid"
  | "dataMermaid"
  | "json"
  | "dataObjectsCsv"
  | "issuesCsv"
  | "codexPrompt"
  | "cursorPrompt"
  | "githubIssues"
  | "bundle";

export type ExportMode = "confirmedOnly" | "auditTrail";

export type ExportContentOptions = {
  mode?: ExportMode;
  includeValidationAppendix?: boolean;
  generatedAt?: string;
};

export type ExportBundleFile = {
  fileName: string;
  exportType: Exclude<ExportType, "bundle">;
  content: string;
};

export type ExportBundleManifest = {
  appVersion: string;
  exportMode: ExportMode;
  generatedAt: string;
  validationSummary: {
    errorCount: number;
    warningCount: number;
    isExportSafe: boolean;
  };
  files: Array<{
    fileName: string;
    exportType: Exclude<ExportType, "bundle">;
    contentLength: number;
  }>;
};

export type ExportBundle = {
  projectId: string;
  mode: ExportMode;
  manifest: ExportBundleManifest;
  files: ExportBundleFile[];
};

export const EXPORT_DESCRIPTIONS: Record<ExportType, string> = {
  markdown: "사람이 읽으며 앱 구조, 흐름, 빠진 결정을 검토할 때 사용합니다.",
  appMermaid: "화면과 기능 관계를 Mermaid 다이어그램으로 확인하거나 문서에 붙일 때 사용합니다.",
  dataMermaid: "앱이 저장할 정보와 관계를 Mermaid ERD로 확인할 때 사용합니다.",
  json: "확정된 구조 데이터를 다른 도구나 다음 App X-Ray 작업으로 넘길 때 사용합니다.",
  dataObjectsCsv: "앱이 저장할 정보를 표 형태로 검토하거나 스프레드시트로 옮길 때 사용합니다.",
  issuesCsv: "빠진 결정 사항을 표 형태로 분류하고 우선순위를 정할 때 사용합니다.",
  codexPrompt: "확정 구조만 기반으로 Codex에 구현 요청을 전달할 때 사용합니다.",
  cursorPrompt: "확정 구조만 기반으로 Cursor에 구현 요청을 전달할 때 사용합니다.",
  githubIssues: "확정된 빠진 결정 사항을 GitHub issue 초안으로 옮길 때 사용합니다.",
  bundle: "여러 export 파일과 manifest를 한 번에 검토하거나 전달할 때 사용합니다.",
};

export function getExportContent(workspace: ProjectWorkspace, type: ExportType, options: ExportContentOptions = {}): string {
  const exportOptions = toExportOptions(options);
  if (type === "markdown") return exportProjectMarkdown(workspace, exportOptions);
  if (type === "appMermaid") return exportAppMapMermaid(workspace, exportOptions);
  if (type === "dataMermaid") return exportDataMapMermaid(workspace, exportOptions);
  if (type === "json") return exportProjectJson(workspace, exportOptions);
  if (type === "dataObjectsCsv") return exportDataObjectsCsv(workspace, exportOptions);
  if (type === "issuesCsv") return exportIssuesCsv(workspace, exportOptions);
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
  if (type === "dataObjectsCsv") return `app-xray-${projectSlug}-data-objects.csv`;
  if (type === "issuesCsv") return `app-xray-${projectSlug}-issues.csv`;
  if (type === "codexPrompt") return `app-xray-${projectSlug}-codex.md`;
  if (type === "cursorPrompt") return `app-xray-${projectSlug}-cursor.md`;
  if (type === "githubIssues") return `app-xray-${projectSlug}-github-issues.md`;
  return `app-xray-${projectSlug}-bundle.json`;
}

export function createExportBundle(workspace: ProjectWorkspace, options: ExportContentOptions = {}): ExportBundle {
  const exportTypes: Exclude<ExportType, "bundle">[] = [
    "markdown",
    "appMermaid",
    "dataMermaid",
    "json",
    "dataObjectsCsv",
    "issuesCsv",
    "codexPrompt",
    "cursorPrompt",
    "githubIssues",
  ];
  const files = exportTypes.map((exportType) => {
    const content = getExportContent(workspace, exportType, options);
    return {
      fileName: getExportFileName(workspace, exportType),
      exportType,
      content,
    };
  });
  const validation = validateWorkspace(workspace);
  const mode = options.mode ?? "confirmedOnly";

  return {
    projectId: workspace.project.id,
    mode,
    manifest: {
      appVersion: APP_VERSION,
      exportMode: mode,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      validationSummary: {
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        isExportSafe: validation.isExportSafe,
      },
      files: files.map((file) => ({
        fileName: file.fileName,
        exportType: file.exportType,
        contentLength: file.content.length,
      })),
    },
    files,
  };
}

export function getExportDescription(type: ExportType): string {
  return EXPORT_DESCRIPTIONS[type];
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
