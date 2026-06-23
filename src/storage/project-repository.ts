import type { ProjectWorkspace } from "../domain/workspace.js";

export type ProjectRepository = {
  load(): ProjectWorkspace | null;
  loadWithStatus(): ProjectLoadResult;
  save(workspace: ProjectWorkspace): void;
  clear(): void;
};

export type ProjectLoadResult = {
  workspace: ProjectWorkspace | null;
  error?: string;
};

const STORAGE_KEY = "app-xray.workspace.v1";

export function createLocalStorageProjectRepository(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): ProjectRepository {
  return {
    load() {
      return loadProjectWorkspace(storage).workspace;
    },
    loadWithStatus() {
      return loadProjectWorkspace(storage);
    },
    save(workspace) {
      storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    },
    clear() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}

export function loadProjectWorkspace(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): ProjectLoadResult {
  const raw = storage.getItem(STORAGE_KEY);
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
