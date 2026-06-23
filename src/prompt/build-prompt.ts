import { exportable } from "../export/markdown.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { validateWorkspace } from "../domain/validation.js";

export type BuildPromptTarget = "codex" | "cursor";
export type ExtendedBuildPromptTarget = BuildPromptTarget | "lovable" | "replit" | "bolt";

export function createBuildPrompt(
  workspace: ProjectWorkspace,
  options: { targetTool: ExtendedBuildPromptTarget; buildStepTempId?: string },
): string {
  const screens = exportable(workspace.objects.screens);
  const dataObjects = exportable(workspace.objects.dataObjects);
  const flows = exportable(workspace.objects.flows);
  const issues = exportable(workspace.objects.issues).filter((issue) => issue.includeInPrompt !== false);
  const validation = validateWorkspace(workspace);
  const selectedBuildSteps = options.buildStepTempId
    ? workspace.buildPlanSuggestions.filter((step) => step.tempId === options.buildStepTempId)
    : workspace.buildPlanSuggestions;
  const toolName = toolLabel(options.targetTool);
  const targetInstruction = targetInstructionFor(options.targetTool);

  return [
    `You are implementing ${workspace.project.name} with ${toolName}.`,
    "",
    "Core rule: build only from confirmed structured data. Do not treat rejected, deferred, or suggested-only items as scope.",
    targetInstruction,
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
    "Build step focus:",
    ...emptyAware(selectedBuildSteps.map((step) => `- ${step.title}: ${step.description}`)),
    "",
    "Known missing parts to resolve before coding:",
    ...issues.map((issue) =>
      [
        `- ${issue.title}: ${issue.description}`,
        issue.suggestion ? `  Suggested decision: ${issue.suggestion}` : undefined,
        issue.resolutionNote ? `  User note: ${issue.resolutionNote}` : undefined,
      ].filter(Boolean).join("\n"),
    ),
    "",
    "Export validation warnings:",
    ...emptyAware(validation.warnings.map((warning) => `- ${warning.message}`)),
    "",
    "Excluded scope: SaaS backend, login, billing, team collaboration, marketplace, GitHub write integration, and real AI provider calls.",
  ].join("\n");
}

function emptyAware(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None"];
}

function toolLabel(target: ExtendedBuildPromptTarget): string {
  const labels: Record<ExtendedBuildPromptTarget, string> = {
    codex: "Codex",
    cursor: "Cursor",
    lovable: "Lovable",
    replit: "Replit",
    bolt: "Bolt",
  };
  return labels[target];
}

function targetInstructionFor(target: ExtendedBuildPromptTarget): string {
  const instructions: Record<ExtendedBuildPromptTarget, string> = {
    codex: "Use repository-local patterns, keep changes reviewable, and verify before reporting completion.",
    cursor: "Use the existing project context, keep edits scoped, and do not generate code from unconfirmed suggestions.",
    lovable: "Build only the confirmed app structure and keep database/auth assumptions explicit.",
    replit: "Prefer a small runnable MVP and do not add cloud-only services unless confirmed.",
    bolt: "Generate only the confirmed screens, data, and flows; keep rejected suggestions out of scope.",
  };
  return instructions[target];
}
