import type { SourceDocument } from "../domain/types.js";

export type StructuredAnalysisPrompt = {
  system: string;
  user: string;
};

export type BuildStructuredAnalysisPromptInput = {
  sourceDocument: SourceDocument;
};

export const APP_XRAY_ANALYSIS_JSON_INSTRUCTIONS = `App X-Ray analysis contract:
- AI suggests. The user confirms. Logic preserves.
- Return JSON only. Do not wrap the response in Markdown, code fences, comments, or prose.
- Treat every extracted item as a suggestion, not confirmed project data.
- Use temporary IDs in tempId fields. Keep them stable within one response so references can connect objects.
- Set confidence values from 0 to 1. Mark inferred items with inferred: true when the source does not say them directly.
- Preserve short sourceQuote values when the source text supports a suggestion.
- If a category is not present, return an empty array for that category.
- Top-level JSON object must include exactly these analysis sections:
{
  "summary": {
    "appName": "optional string",
    "appTypes": ["string"],
    "confidence": 0,
    "plainLanguageSummary": "string",
    "targetUsers": ["optional string"]
  },
  "requirements": [],
  "screens": [],
  "features": [],
  "dataObjects": [],
  "dataRelations": [],
  "roles": [],
  "permissions": [],
  "flows": [],
  "issues": [],
  "buildPlan": []
}
- Every suggestion object must include tempId and confidence.
- requirements use requirementType: screen, feature, data, permission, flow, non_functional, business_rule, or unknown.
- screens use screenType: dashboard, list, detail, form, settings, admin, report, canvas, modal, or unknown.
- features use actionType: create, read, update, delete, search, filter, import, export, notify, approve, visualize, or unknown.
- dataObjects use objectType: person, role, asset, location, event, record, file, transaction, setting, or unknown.
- dataObject.fields use fieldType: text, number, boolean, date, datetime, enum, relation, file, json, or unknown.
- dataRelations use relationType: one_to_one, one_to_many, many_to_one, many_to_many, contains, references, owns, creates, or unknown.
- permissions use targetType: screen, feature, dataObject, or project, and action: view, create, edit, delete, export, approve, or manage.
- issues use issueType: missing, ambiguous, conflict, data_gap, permission_gap, state_gap, exception_gap, or scope_risk; severity must be low, medium, or high.
- buildPlan items describe reviewable implementation steps and may include includedScreenTempIds, includedDataObjectTempIds, excludedScope, and completionCriteria.`;

export function buildStructuredAnalysisPrompt(input: BuildStructuredAnalysisPromptInput): StructuredAnalysisPrompt {
  return {
    system: [
      "You are App X-Ray's structured analysis engine.",
      "Return JSON only and follow the embedded extraction contract exactly.",
      "Use plain language for explanations so non-developer app builders can review the output.",
    ].join(" "),
    user: [
      APP_XRAY_ANALYSIS_JSON_INSTRUCTIONS,
      "",
      "Analyze this source document:",
      `Title: ${input.sourceDocument.title}`,
      `Source type: ${input.sourceDocument.sourceType}`,
      `Version: ${input.sourceDocument.version}`,
      "",
      input.sourceDocument.content,
    ].join("\n"),
  };
}
