import { exportable } from "../export/markdown.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

export type BuildPromptTarget = "codex" | "cursor";

export function createBuildPrompt(
  workspace: ProjectWorkspace,
  options: { targetTool: BuildPromptTarget },
): string {
  const screens = exportable(workspace.objects.screens);
  const dataObjects = exportable(workspace.objects.dataObjects);
  const flows = exportable(workspace.objects.flows);
  const issues = exportable(workspace.objects.issues);
  const toolName = options.targetTool === "codex" ? "Codex" : "Cursor";

  return [
    `You are implementing ${workspace.project.name} with ${toolName}.`,
    "",
    "Core rule: build only from confirmed structured data. Do not treat rejected, deferred, or suggested-only items as scope.",
    "",
    "Confirmed app screens:",
    ...screens.map((screen) => `- ${screen.displayName ?? screen.name}: ${screen.description ?? screen.screenType}`),
    "",
    "Confirmed data the app must remember:",
    ...dataObjects.map((object) => `- ${object.displayName ?? object.name}: ${object.description ?? object.objectType}`),
    "",
    "Confirmed user flows:",
    ...flows.map((flow) => `- ${flow.name}: ${flow.description ?? "No description"}`),
    "",
    "Known missing parts to resolve before coding:",
    ...issues.map((issue) => `- ${issue.title}: ${issue.description}`),
    "",
    "Excluded scope: SaaS backend, login, billing, team collaboration, marketplace, GitHub write integration, and real AI provider calls.",
  ].join("\n");
}
