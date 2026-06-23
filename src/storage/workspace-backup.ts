import { mergeAiSuggestionsPreservingConfirmed } from "../domain/lifecycle.js";
import { validateWorkspace, type ValidationReport } from "../domain/validation.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

export type WorkspaceBackup = {
  schemaVersion: "1.0.0";
  exportedAt: string;
  workspace: ProjectWorkspace;
};

export type WorkspaceImportResult =
  | { ok: true; workspace: ProjectWorkspace; validation: ValidationReport }
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

export function importWorkspaceBackup(raw: string, currentWorkspace: ProjectWorkspace | null): WorkspaceImportResult {
  let parsed: Partial<WorkspaceBackup>;
  try {
    parsed = JSON.parse(raw) as Partial<WorkspaceBackup>;
  } catch {
    return { ok: false, error: "백업 파일을 읽을 수 없습니다. JSON 형식을 확인하세요." };
  }

  if (parsed.schemaVersion !== "1.0.0" || !parsed.workspace?.project || !parsed.workspace.objects) {
    return { ok: false, error: "App X-Ray workspace 백업 파일이 아닙니다." };
  }

  const imported = parsed.workspace;
  const workspace = currentWorkspace ? mergeWorkspacePreservingConfirmed(currentWorkspace, imported) : imported;
  return {
    ok: true,
    workspace,
    validation: validateWorkspace(workspace),
  };
}

function mergeWorkspacePreservingConfirmed(current: ProjectWorkspace, imported: ProjectWorkspace): ProjectWorkspace {
  const sourceDocumentIds = new Set(current.sourceDocuments.map((source) => source.id));
  const importedSourceDocuments = imported.sourceDocuments.filter((source) => !sourceDocumentIds.has(source.id));
  const now = new Date().toISOString();

  return {
    ...current,
    sourceDocuments: [...current.sourceDocuments, ...importedSourceDocuments],
    objects: mergeAiSuggestionsPreservingConfirmed(current.objects, imported.objects),
    buildPlanSuggestions: imported.buildPlanSuggestions.length > 0 ? imported.buildPlanSuggestions : current.buildPlanSuggestions,
    updatedAt: now,
  };
}
