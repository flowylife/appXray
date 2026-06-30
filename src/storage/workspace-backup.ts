import { mergeAiSuggestionsPreservingConfirmed } from "../domain/lifecycle.js";
import { validateWorkspace, type ValidationReport } from "../domain/validation.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { isStoredProjectWorkspace } from "./workspace-shape.js";

export type WorkspaceBackup = {
  schemaVersion: "1.0.0";
  exportedAt: string;
  workspace: ProjectWorkspace;
};

export type WorkspaceImportResult =
  | { ok: true; workspace: ProjectWorkspace; validation: ValidationReport }
  | { ok: false; error: string };

export type WorkspaceBackupParseResult =
  | { ok: true; backup: WorkspaceBackup; workspace: ProjectWorkspace; exportedAt: string; validation: ValidationReport }
  | { ok: false; error: string };

export function createWorkspaceBackup(workspace: ProjectWorkspace, exportedAt = new Date().toISOString()): WorkspaceBackup {
  return {
    schemaVersion: "1.0.0",
    exportedAt,
    workspace,
  };
}

export function serializeWorkspaceBackup(workspace: ProjectWorkspace): string {
  return JSON.stringify(createWorkspaceBackup(workspace), null, 2);
}

export function parseWorkspaceBackup(raw: string): WorkspaceBackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "백업 파일을 읽을 수 없습니다. JSON 형식을 확인하세요." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "App X-Ray workspace 백업 파일이 아닙니다." };
  }
  if (parsed.schemaVersion !== "1.0.0") {
    return { ok: false, error: "지원하지 않는 백업 버전입니다." };
  }
  if (typeof parsed.exportedAt !== "string") {
    return { ok: false, error: "백업 파일에 필요한 exportedAt 필드가 없습니다." };
  }
  if (!isStoredProjectWorkspace(parsed.workspace)) {
    return { ok: false, error: "백업 파일에 필요한 workspace 필드가 없습니다." };
  }

  const backup = parsed as WorkspaceBackup;
  const validation = validateWorkspaceSafely(backup.workspace);
  if (!validation) {
    return { ok: false, error: "백업 파일에 필요한 workspace 필드가 없습니다." };
  }
  return {
    ok: true,
    backup,
    workspace: backup.workspace,
    exportedAt: backup.exportedAt,
    validation,
  };
}

export function mergeWorkspaceBackup(
  currentWorkspace: ProjectWorkspace,
  importedWorkspace: ProjectWorkspace,
  now = new Date().toISOString(),
): ProjectWorkspace {
  return mergeWorkspacePreservingConfirmed(currentWorkspace, importedWorkspace, now);
}

export function replaceWorkspaceFromBackup(
  importedWorkspace: ProjectWorkspace,
  now = new Date().toISOString(),
): ProjectWorkspace {
  return {
    ...importedWorkspace,
    project: {
      ...importedWorkspace.project,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function importWorkspaceBackup(raw: string, currentWorkspace: ProjectWorkspace | null): WorkspaceImportResult {
  const parsed = parseWorkspaceBackup(raw);
  if (!parsed.ok) return parsed;

  const workspace = currentWorkspace
    ? mergeWorkspaceBackup(currentWorkspace, parsed.workspace)
    : replaceWorkspaceFromBackup(parsed.workspace);
  return {
    ok: true,
    workspace,
    validation: validateWorkspace(workspace),
  };
}

function mergeWorkspacePreservingConfirmed(
  current: ProjectWorkspace,
  imported: ProjectWorkspace,
  now: string,
): ProjectWorkspace {
  const sourceDocumentIds = new Set(current.sourceDocuments.map((source) => source.id));
  const importedSourceDocuments = imported.sourceDocuments.filter((source) => !sourceDocumentIds.has(source.id));

  return {
    ...current,
    sourceDocuments: [...current.sourceDocuments, ...importedSourceDocuments],
    objects: mergeAiSuggestionsPreservingConfirmed(current.objects, imported.objects),
    buildPlanSuggestions: imported.buildPlanSuggestions.length > 0 ? imported.buildPlanSuggestions : current.buildPlanSuggestions,
    updatedAt: now,
  };
}

function validateWorkspaceSafely(workspace: ProjectWorkspace): ValidationReport | null {
  try {
    return validateWorkspace(workspace);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
