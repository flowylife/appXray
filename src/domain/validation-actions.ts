import { projectRoute } from "./routes.js";
import type { ValidationIssue } from "./validation.js";
import type { XraySuggestionBucket } from "./workspace.js";

export type ValidationIssueTarget = {
  bucket: XraySuggestionBucket;
  id: string;
};

export function getValidationIssueTarget(issue: ValidationIssue): ValidationIssueTarget | null {
  const bucket = issue.targetBucket ?? issue.relatedBucket;
  const id = issue.targetId ?? issue.relatedObjectId;
  if (!bucket || !id) return null;
  return { bucket, id };
}

export function getValidationReviewRoute(_issue: ValidationIssue, projectId: string): string {
  return projectRoute(projectId, "review");
}

export function getValidationTargetElementId(bucket: XraySuggestionBucket, id: string): string {
  return `review-${bucket}-${id}`;
}

export function getValidationIssueElementId(issue: ValidationIssue): string | null {
  const target = getValidationIssueTarget(issue);
  if (!target) return null;
  return getValidationTargetElementId(target.bucket, target.id);
}

export function getValidationRepairActionLabel(issue: ValidationIssue): string | null {
  if (issue.suggestedAction === "remove_broken_relation") return "끊긴 연결 제외";
  if (issue.suggestedAction === "mark_duplicate_deferred") return "중복 항목 나중에 결정";
  if (issue.suggestedAction === "exclude_issue_from_prompt") return "프롬프트에서 제외";
  return null;
}
