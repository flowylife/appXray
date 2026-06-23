import type { Project, SourceDocument } from "./types.js";
import type { ProjectWorkspace } from "./workspace.js";

export function getLatestSourceDocument(workspace: ProjectWorkspace): SourceDocument | undefined {
  return [...workspace.sourceDocuments].sort((a, b) => b.version - a.version)[0];
}

export function createSourceDocumentVersion({
  project,
  content,
  createdAt,
  id,
  previousVersion = 0,
  sourceType = "text",
}: {
  project: Project;
  content: string;
  createdAt: string;
  id: string;
  previousVersion?: number;
  sourceType?: SourceDocument["sourceType"] | undefined;
}): SourceDocument {
  return {
    id,
    projectId: project.id,
    title: "아이디어 / PRD",
    content,
    sourceType,
    version: previousVersion + 1,
    createdAt,
  };
}

export function appendSourceDocumentVersion(
  workspace: ProjectWorkspace,
  content: string,
  options: { id: string; createdAt: string; sourceType?: SourceDocument["sourceType"] | undefined },
): ProjectWorkspace {
  const trimmedContent = content.trim();
  const latest = getLatestSourceDocument(workspace);
  if (latest?.content.trim() === trimmedContent) return workspace;

  const sourceDocument = createSourceDocumentVersion({
    project: workspace.project,
    content: trimmedContent,
    createdAt: options.createdAt,
    id: options.id,
    previousVersion: latest?.version ?? 0,
    sourceType: options.sourceType,
  });

  return {
    ...workspace,
    sourceDocuments: [...workspace.sourceDocuments, sourceDocument],
    updatedAt: options.createdAt,
  };
}
