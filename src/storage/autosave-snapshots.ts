import { validateWorkspace, type ValidationReport } from "../domain/validation.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { isStoredProjectWorkspace } from "./workspace-shape.js";

export type AutosaveSnapshot = {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  workspace: ProjectWorkspace;
  validation: ValidationReport;
};

export type AutosaveSnapshotSummary = {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  validation: ValidationReport;
};

export type CreateAutosaveSnapshotOptions = {
  createdAt?: string;
  snapshotId?: string;
  maxSnapshotsPerProject?: number;
};

export type RestoreAutosaveSnapshotResult =
  | { ok: true; snapshot: AutosaveSnapshot; workspace: ProjectWorkspace; validation: ValidationReport }
  | { ok: false; error: string };

export type CreateAutosaveSnapshotResult =
  | { ok: true; snapshot: AutosaveSnapshot }
  | { ok: false; error: string };

export type PruneAutosaveSnapshotResult = {
  snapshots: AutosaveSnapshotSummary[];
  removedSnapshotIds: string[];
};

type SnapshotStorage = Pick<Storage, "getItem" | "setItem">;

const SNAPSHOT_STORAGE_KEY = "app-xray.autosave-snapshots.v1";
const DEFAULT_MAX_SNAPSHOTS_PER_PROJECT = 8;

export function createAutosaveSnapshot(
  storage: SnapshotStorage,
  workspace: ProjectWorkspace,
  options: CreateAutosaveSnapshotOptions = {},
): CreateAutosaveSnapshotResult {
  const existing = readSnapshots(storage);
  if (existing.error) return { ok: false, error: existing.error };
  const createdAt = options.createdAt ?? new Date().toISOString();
  const snapshot: AutosaveSnapshot = {
    id: options.snapshotId ?? createSnapshotId(workspace.project.id, createdAt),
    projectId: workspace.project.id,
    projectName: workspace.project.name,
    createdAt,
    workspace,
    validation: validateWorkspace(workspace),
  };
  const snapshots = [...existing.snapshots.filter((item) => item.id !== snapshot.id), snapshot];
  writeSnapshots(storage, pruneForProject(snapshots, workspace.project.id, options.maxSnapshotsPerProject ?? DEFAULT_MAX_SNAPSHOTS_PER_PROJECT));
  return { ok: true, snapshot };
}

export function listAutosaveSnapshots(
  storage: Pick<Storage, "getItem">,
  projectId?: string,
): AutosaveSnapshotSummary[] {
  return sortSnapshots(readSnapshots(storage).snapshots)
    .filter((snapshot) => !projectId || snapshot.projectId === projectId)
    .map(({ id, projectId: snapshotProjectId, projectName, createdAt, validation }) => ({
      id,
      projectId: snapshotProjectId,
      projectName,
      createdAt,
      validation,
    }));
}

export function restoreAutosaveSnapshot(
  storage: Pick<Storage, "getItem">,
  snapshotId: string,
): RestoreAutosaveSnapshotResult {
  const result = readSnapshots(storage);
  if (result.error) return { ok: false, error: result.error };
  const snapshot = result.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) {
    return { ok: false, error: "선택한 자동 저장 기록을 찾을 수 없습니다." };
  }
  return {
    ok: true,
    snapshot,
    workspace: snapshot.workspace,
    validation: snapshot.validation,
  };
}

export function pruneAutosaveSnapshots(
  storage: SnapshotStorage,
  projectId: string,
  maxSnapshotsPerProject = DEFAULT_MAX_SNAPSHOTS_PER_PROJECT,
): PruneAutosaveSnapshotResult {
  const result = readSnapshots(storage);
  if (result.error) {
    return {
      snapshots: [],
      removedSnapshotIds: [],
    };
  }
  const current = result.snapshots;
  const next = pruneForProject(current, projectId, maxSnapshotsPerProject);
  const nextIds = new Set(next.map((snapshot) => snapshot.id));
  const removedSnapshotIds = sortSnapshots(current)
    .filter((snapshot) => snapshot.projectId === projectId && !nextIds.has(snapshot.id))
    .map((snapshot) => snapshot.id);
  writeSnapshots(storage, next);
  return {
    snapshots: listAutosaveSnapshots(storage, projectId),
    removedSnapshotIds,
  };
}

function readSnapshots(storage: Pick<Storage, "getItem">): { snapshots: AutosaveSnapshot[]; error?: string } {
  const raw = storage.getItem(SNAPSHOT_STORAGE_KEY);
  if (!raw) return { snapshots: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { snapshots: [], error: "자동 저장 기록을 읽을 수 없습니다." };
    const snapshots: AutosaveSnapshot[] = [];
    for (const item of parsed) {
      const snapshot = normalizeAutosaveSnapshot(item);
      if (!snapshot) return { snapshots: [], error: "자동 저장 기록을 읽을 수 없습니다." };
      snapshots.push(snapshot);
    }
    return { snapshots };
  } catch {
    return { snapshots: [], error: "자동 저장 기록을 읽을 수 없습니다." };
  }
}

function writeSnapshots(storage: SnapshotStorage, snapshots: AutosaveSnapshot[]): void {
  storage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(sortSnapshots(snapshots)));
}

function pruneForProject(
  snapshots: AutosaveSnapshot[],
  projectId: string,
  maxSnapshotsPerProject: number,
): AutosaveSnapshot[] {
  const sorted = sortSnapshots(snapshots);
  const keptProjectIds = new Set(sorted.filter((snapshot) => snapshot.projectId === projectId).slice(0, maxSnapshotsPerProject).map((snapshot) => snapshot.id));
  return sorted.filter((snapshot) => snapshot.projectId !== projectId || keptProjectIds.has(snapshot.id));
}

function sortSnapshots(snapshots: AutosaveSnapshot[]): AutosaveSnapshot[] {
  return [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

function normalizeAutosaveSnapshot(value: unknown): AutosaveSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.projectName === "string" &&
    typeof value.createdAt === "string" &&
    isStoredProjectWorkspace(value.workspace) &&
    isRecord(value.validation) &&
    Array.isArray(value.validation.errors) &&
    Array.isArray(value.validation.warnings) &&
    typeof value.validation.isExportSafe === "boolean"
  ) {
    const validation = validateWorkspaceSafely(value.workspace);
    if (!validation) return null;
    return {
      id: value.id,
      projectId: value.projectId,
      projectName: value.projectName,
      createdAt: value.createdAt,
      workspace: value.workspace,
      validation,
    };
  }
  return null;
}

function createSnapshotId(projectId: string, createdAt: string): string {
  const stableTime = createdAt.replace(/[^0-9]/g, "");
  const stableProject = projectId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `snapshot_${stableProject}_${stableTime}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateWorkspaceSafely(workspace: ProjectWorkspace): ValidationReport | null {
  try {
    return validateWorkspace(workspace);
  } catch {
    return null;
  }
}
