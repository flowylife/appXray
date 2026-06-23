import type { Issue, XrayObject } from "../domain/types.js";
import type { ProjectWorkspace } from "../domain/workspace.js";
import { exportable, type ExportOptions } from "./markdown.js";

export function exportGithubIssuesMarkdown(workspace: ProjectWorkspace, options?: ExportOptions): string {
  const issues = exportable(workspace.objects.issues, options);

  return [
    "# GitHub Issue Markdown",
    "",
    `Project: ${workspace.project.name}`,
    "",
    ...emptyAware(issues.map((issue) => renderIssue(workspace, issue))),
    "",
  ].join("\n");
}

function renderIssue(workspace: ProjectWorkspace, issue: Issue): string {
  const related = relatedStructure(workspace, issue);

  return [
    `## ${issue.title}`,
    "",
    "### Context",
    issue.description,
    issue.suggestion ? `Suggested decision: ${issue.suggestion}` : undefined,
    issue.resolutionNote ? `User note: ${issue.resolutionNote}` : undefined,
    "",
    "### Tasks",
    "- [ ] Decide the missing app rule in plain language",
    "- [ ] Update the confirmed App X-Ray structure",
    "- [ ] Re-run export validation",
    "",
    "### Acceptance Criteria",
    "- [ ] The decision is reflected in accepted or edited structure",
    "- [ ] Rejected, deferred, or suggested-only items are not treated as scope",
    "- [ ] Export validation has no blocking errors",
    "",
    "### Related App Structure",
    ...emptyAware(related),
    "",
    "### Excluded Scope",
    "- Do not add SaaS backend, login, billing, team collaboration, marketplace, GitHub write integration, or real AI provider calls for this issue.",
  ].filter((line): line is string => line !== undefined).join("\n");
}

function relatedStructure(workspace: ProjectWorkspace, issue: Issue): string[] {
  const relatedObjects: XrayObject[] = [];
  const screen = workspace.objects.screens.find((object) => object.id === issue.relatedScreenId);
  const dataObject = workspace.objects.dataObjects.find((object) => object.id === issue.relatedDataObjectId);
  const feature = workspace.objects.features.find((object) => object.id === issue.relatedFeatureId);
  if (screen) relatedObjects.push(screen);
  if (dataObject) relatedObjects.push(dataObject);
  if (feature) relatedObjects.push(feature);

  return relatedObjects.map((object) => {
    if ("displayName" in object && object.displayName) return `- ${object.displayName}`;
    if ("name" in object) return `- ${object.name}`;
    return `- ${object.id}`;
  });
}

function emptyAware(lines: string[]): string[] {
  return lines.length > 0 ? lines : ["- None"];
}
