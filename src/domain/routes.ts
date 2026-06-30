export type AppRoute =
  | { name: "projects" }
  | { name: "newProject" }
  | { name: "projectSection"; projectId: string; section: ProjectRouteSection }
  | { name: "aiSettings" };

export type ProjectRouteSection =
  | "source"
  | "review"
  | "app-map"
  | "data-map"
  | "issues"
  | "prompts"
  | "export";

export function parseAppRoute(hash: string): AppRoute {
  const normalized = hash.replace(/^#\/?/, "");
  if (normalized === "settings/ai") return { name: "aiSettings" };
  if (normalized === "projects/new") return { name: "newProject" };
  if (normalized === "projects" || normalized === "") return { name: "projects" };

  const match = normalized.match(/^projects\/([^/]+)\/([^/]+)$/);
  if (match?.[1] && match[2]) {
    return {
      name: "projectSection",
      projectId: decodeURIComponent(match[1]),
      section: normalizeProjectSection(match[2]),
    };
  }

  return { name: "projects" };
}

export function projectRoute(projectId: string, section: ProjectRouteSection): string {
  return `#/projects/${encodeURIComponent(projectId)}/${section}`;
}

export function projectOrListRoute(projectId: string | null | undefined, section: ProjectRouteSection = "review"): string {
  return projectId ? projectRoute(projectId, section) : "#/projects";
}

function normalizeProjectSection(value: string): ProjectRouteSection {
  if (value === "review") return "review";
  if (value === "app-map") return "app-map";
  if (value === "data-map") return "data-map";
  if (value === "issues") return "issues";
  if (value === "prompts") return "prompts";
  if (value === "export") return "export";
  return "source";
}
