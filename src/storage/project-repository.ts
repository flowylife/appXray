import type { ProjectWorkspace } from "../domain/workspace.js";

export type ProjectRepository = {
  load(): ProjectWorkspace | null;
  save(workspace: ProjectWorkspace): void;
  clear(): void;
};

const STORAGE_KEY = "app-xray.workspace.v1";

export function createLocalStorageProjectRepository(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): ProjectRepository {
  return {
    load() {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;

      try {
        return JSON.parse(raw) as ProjectWorkspace;
      } catch {
        return null;
      }
    },
    save(workspace) {
      storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    },
    clear() {
      storage.removeItem(STORAGE_KEY);
    },
  };
}
