import type { SourceDocument } from "../domain/types.js";
import { createEmptySuggestionSet, type ProjectWorkspace } from "../domain/workspace.js";

export type ProjectRepository = {
  load(): ProjectWorkspace | null;
  loadWithStatus(): ProjectLoadResult;
  loadCollectionWithStatus(): ProjectCollectionLoadResult;
  save(workspace: ProjectWorkspace): void;
  saveWorkspace(workspace: ProjectWorkspace): ProjectCollectionLoadResult;
  setActiveProject(projectId: string): ProjectLoadResult;
  deleteWorkspace(projectId: string): ProjectCollectionLoadResult;
  clear(): void;
  clearAll(): void;
};

export type ProjectLoadResult = {
  workspace: ProjectWorkspace | null;
  error?: string | undefined;
};

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export type ProjectCollection = {
  activeProjectId?: string | undefined;
  workspaces: ProjectWorkspace[];
  updatedAt: string;
};

export type ProjectCollectionLoadResult = {
  collection: ProjectCollection;
  activeWorkspace: ProjectWorkspace | null;
  error?: string | undefined;
};

export type CreateProjectWorkspaceInput = {
  name: string;
  sourceText: string;
  sourceType: SourceDocument["sourceType"];
  now?: string | undefined;
  projectId?: string | undefined;
  sourceDocumentId?: string | undefined;
};

const LEGACY_STORAGE_KEY = "app-xray.workspace.v1";
const COLLECTION_STORAGE_KEY = "app-xray.projects.v1";

export function createLocalStorageProjectRepository(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): ProjectRepository {
  return {
    load() {
      return loadProjectCollection(storage).activeWorkspace;
    },
    loadWithStatus() {
      const result = loadProjectCollection(storage);
      return {
        workspace: result.activeWorkspace,
        error: result.error,
      };
    },
    loadCollectionWithStatus() {
      return loadProjectCollection(storage);
    },
    save(workspace) {
      const result = saveWorkspaceToCollection(storage, workspace);
      if (result.error) throw new Error(result.error);
    },
    saveWorkspace(workspace) {
      return saveWorkspaceToCollection(storage, workspace);
    },
    setActiveProject(projectId) {
      const result = loadProjectCollection(storage);
      const requestedWorkspace = result.collection.workspaces.find((workspace) => workspace.project.id === projectId);
      if (!requestedWorkspace) {
        return {
          workspace: result.activeWorkspace,
          error: "요청한 로컬 프로젝트를 찾을 수 없습니다.",
        };
      }
      const collection = {
        ...result.collection,
        activeProjectId: projectId,
        updatedAt: new Date().toISOString(),
      };
      storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
      return {
        workspace: requestedWorkspace,
        error: result.error,
      };
    },
    deleteWorkspace(projectId) {
      const result = loadProjectCollection(storage);
      const workspaces = result.collection.workspaces.filter((workspace) => workspace.project.id !== projectId);
      const activeProjectId =
        result.collection.activeProjectId === projectId
          ? workspaces[0]?.project.id
          : result.collection.activeProjectId;
      const collection = {
        activeProjectId,
        workspaces,
        updatedAt: new Date().toISOString(),
      };
      storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
      if (workspaces.length === 0) storage.removeItem(LEGACY_STORAGE_KEY);
      return toCollectionLoadResult(collection, result.error);
    },
    clear() {
      const activeProjectId = loadProjectCollection(storage).collection.activeProjectId;
      if (!activeProjectId) {
        storage.removeItem(LEGACY_STORAGE_KEY);
        return;
      }
      const result = loadProjectCollection(storage);
      const workspaces = result.collection.workspaces.filter((workspace) => workspace.project.id !== activeProjectId);
      const collection = {
        activeProjectId: workspaces[0]?.project.id,
        workspaces,
        updatedAt: new Date().toISOString(),
      };
      storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
      if (workspaces.length === 0) storage.removeItem(LEGACY_STORAGE_KEY);
    },
    clearAll() {
      storage.removeItem(COLLECTION_STORAGE_KEY);
      storage.removeItem(LEGACY_STORAGE_KEY);
    },
  };
}

export function loadProjectWorkspace(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ProjectLoadResult {
  const result = loadProjectCollection(storage);
  return {
    workspace: result.activeWorkspace,
    error: result.error,
  };
}

export function loadProjectCollection(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ProjectCollectionLoadResult {
  const rawCollection = storage.getItem(COLLECTION_STORAGE_KEY);
  if (rawCollection) {
    try {
      return toCollectionLoadResult(JSON.parse(rawCollection) as ProjectCollection);
    } catch {
      return {
        collection: emptyCollection(),
        activeWorkspace: null,
        error: "저장된 로컬 프로젝트 목록을 읽을 수 없어 빈 상태로 시작했습니다.",
      };
    }
  }

  const legacyResult = loadLegacyWorkspace(storage);
  if (!legacyResult.workspace) {
    return {
      collection: emptyCollection(),
      activeWorkspace: null,
      error: legacyResult.error,
    };
  }

  const collection = {
    activeProjectId: legacyResult.workspace.project.id,
    workspaces: [legacyResult.workspace],
    updatedAt: legacyResult.workspace.updatedAt,
  };

  return toCollectionLoadResult(collection, legacyResult.error);
}

export function summarizeProjects(collection: ProjectCollection): ProjectSummary[] {
  return collection.workspaces
    .map((workspace) => ({
      id: workspace.project.id,
      name: workspace.project.name,
      updatedAt: workspace.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createProjectWorkspace(input: CreateProjectWorkspaceInput): ProjectWorkspace {
  const now = input.now ?? new Date().toISOString();
  const projectId = input.projectId ?? `project_${crypto.randomUUID()}`;
  const sourceDocumentId = input.sourceDocumentId ?? `src_${crypto.randomUUID()}`;
  const projectName = input.name.trim() || "새 앱 아이디어";

  return {
    project: {
      id: projectId,
      name: projectName,
      description: "AI가 만들기 전에 구조를 먼저 확인하는 로컬 프로젝트",
      appTypes: [],
      createdAt: now,
      updatedAt: now,
    },
    sourceDocuments: [
      {
        id: sourceDocumentId,
        projectId,
        title: "아이디어 / PRD",
        content: input.sourceText.trim(),
        sourceType: input.sourceType,
        version: 1,
        createdAt: now,
      },
    ],
    objects: createEmptySuggestionSet(),
    buildPlanSuggestions: [],
    updatedAt: now,
  };
}

function saveWorkspaceToCollection(
  storage: Pick<Storage, "getItem" | "setItem">,
  workspace: ProjectWorkspace,
): ProjectCollectionLoadResult {
  const current = loadProjectCollection(storage).collection;
  const existingIndex = current.workspaces.findIndex((candidate) => candidate.project.id === workspace.project.id);
  const duplicateName = current.workspaces.find(
    (candidate) =>
      candidate.project.id !== workspace.project.id &&
      normalizeProjectName(candidate.project.name) === normalizeProjectName(workspace.project.name),
  );
  if (duplicateName) {
    return toCollectionLoadResult(
      current,
      `이미 같은 이름의 로컬 프로젝트가 있습니다: ${duplicateName.project.name}`,
    );
  }
  const workspaces =
    existingIndex === -1
      ? [workspace, ...current.workspaces]
      : current.workspaces.map((candidate, index) => (index === existingIndex ? workspace : candidate));
  const collection = {
    activeProjectId: workspace.project.id,
    workspaces,
    updatedAt: workspace.updatedAt,
  };
  storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
  return toCollectionLoadResult(collection);
}

function loadLegacyWorkspace(storage: Pick<Storage, "getItem">): ProjectLoadResult {
  const raw = storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return { workspace: null };
  try {
    return { workspace: JSON.parse(raw) as ProjectWorkspace };
  } catch {
    return {
      workspace: null,
      error: "저장된 로컬 프로젝트를 읽을 수 없어 빈 상태로 시작했습니다.",
    };
  }
}

function toCollectionLoadResult(collection: ProjectCollection, error?: string): ProjectCollectionLoadResult {
  const activeWorkspace =
    collection.workspaces.find((workspace) => workspace.project.id === collection.activeProjectId) ??
    collection.workspaces[0] ??
    null;

  return {
    collection: {
      ...collection,
      activeProjectId: activeWorkspace?.project.id,
      workspaces: collection.workspaces,
    },
    activeWorkspace,
    error,
  };
}

function emptyCollection(): ProjectCollection {
  return {
    workspaces: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeProjectName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
