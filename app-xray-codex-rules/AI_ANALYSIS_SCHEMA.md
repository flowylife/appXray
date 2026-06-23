# AI Analysis JSON Schema

## Purpose

This file defines the expected shape of AI analysis output.

AI output must be treated as suggestions, not final project state.

## Top-Level Shape

```ts
type AiAnalysisResult = {
  summary: AiAnalysisSummary;
  requirements: AiRequirementSuggestion[];
  screens: AiScreenSuggestion[];
  features: AiFeatureSuggestion[];
  dataObjects: AiDataObjectSuggestion[];
  dataRelations: AiDataRelationSuggestion[];
  roles: AiRoleSuggestion[];
  permissions: AiPermissionSuggestion[];
  flows: AiFlowSuggestion[];
  issues: AiIssueSuggestion[];
  buildPlan: AiBuildStepSuggestion[];
};
```

## Summary

```ts
type AiAnalysisSummary = {
  appName?: string;
  appTypes: string[];
  confidence: number;
  plainLanguageSummary: string;
  targetUsers?: string[];
};
```

## Common Fields

```ts
type AiSuggestionBase = {
  tempId: string;
  confidence: number;
  sourceQuote?: string;
  inferred?: boolean;
  reasoning?: string;
};
```

## Requirement Suggestion

```ts
type AiRequirementSuggestion = AiSuggestionBase & {
  text: string;
  requirementType:
    | "screen"
    | "feature"
    | "data"
    | "permission"
    | "flow"
    | "non_functional"
    | "business_rule"
    | "unknown";
  priority?: "low" | "medium" | "high";
};
```

## Screen Suggestion

```ts
type AiScreenSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  description?: string;
  screenType:
    | "dashboard"
    | "list"
    | "detail"
    | "form"
    | "settings"
    | "admin"
    | "report"
    | "canvas"
    | "modal"
    | "unknown";
  parentTempId?: string;
  relatedRequirementTempIds?: string[];
};
```

## Feature Suggestion

```ts
type AiFeatureSuggestion = AiSuggestionBase & {
  name: string;
  description?: string;
  actionType:
    | "create"
    | "read"
    | "update"
    | "delete"
    | "search"
    | "filter"
    | "import"
    | "export"
    | "notify"
    | "approve"
    | "visualize"
    | "unknown";
  screenTempId?: string;
  relatedRequirementTempIds?: string[];
};
```

## Data Object Suggestion

```ts
type AiDataObjectSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  description?: string;
  objectType:
    | "person"
    | "role"
    | "asset"
    | "location"
    | "event"
    | "record"
    | "file"
    | "transaction"
    | "setting"
    | "unknown";
  fields: AiDataFieldSuggestion[];
};
```

## Data Field Suggestion

```ts
type AiDataFieldSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  fieldType:
    | "text"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "enum"
    | "relation"
    | "file"
    | "json"
    | "unknown";
  required?: boolean;
  enumValues?: string[];
  description?: string;
};
```

## Data Relation Suggestion

```ts
type AiDataRelationSuggestion = AiSuggestionBase & {
  sourceObjectTempId: string;
  targetObjectTempId: string;
  relationType:
    | "one_to_one"
    | "one_to_many"
    | "many_to_one"
    | "many_to_many"
    | "contains"
    | "references"
    | "owns"
    | "creates"
    | "unknown";
  description?: string;
};
```

## Role Suggestion

```ts
type AiRoleSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  description?: string;
};
```

## Permission Suggestion

```ts
type AiPermissionSuggestion = AiSuggestionBase & {
  roleTempId: string;
  targetType: "screen" | "feature" | "dataObject" | "project";
  targetTempId?: string;
  action:
    | "view"
    | "create"
    | "edit"
    | "delete"
    | "export"
    | "approve"
    | "manage";
  allowed: boolean;
};
```

## Flow Suggestion

```ts
type AiFlowSuggestion = AiSuggestionBase & {
  name: string;
  description?: string;
  primaryRoleTempId?: string;
  steps: AiFlowStepSuggestion[];
};
```

## Flow Step Suggestion

```ts
type AiFlowStepSuggestion = AiSuggestionBase & {
  stepOrder: number;
  screenTempId?: string;
  actionDescription: string;
  dataObjectTempId?: string;
  featureTempId?: string;
};
```

## Issue Suggestion

```ts
type AiIssueSuggestion = AiSuggestionBase & {
  issueType:
    | "missing"
    | "ambiguous"
    | "conflict"
    | "data_gap"
    | "permission_gap"
    | "state_gap"
    | "exception_gap"
    | "scope_risk";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggestion?: string;
  relatedScreenTempId?: string;
  relatedDataObjectTempId?: string;
  relatedFeatureTempId?: string;
};
```

## Build Step Suggestion

```ts
type AiBuildStepSuggestion = AiSuggestionBase & {
  title: string;
  description: string;
  includedScreenTempIds?: string[];
  includedDataObjectTempIds?: string[];
  excludedScope?: string[];
  completionCriteria?: string[];
};
```

## Validation Rules

Before saving AI output:

1. Ensure top-level arrays exist.
2. Ensure all `tempId` values are unique within their object category.
3. Ensure confidence is between 0 and 1.
4. Ensure enum values are valid.
5. Drop invalid relation references or mark them as unresolved.
6. Never crash when optional fields are missing.
7. Store invalid fragments in an error/debug area only if useful.

## Conversion Rule

AI temp IDs must be converted to app-generated stable IDs.

Example:

```text
AI tempId: screen_load_list
Stable ID: scr_01H...
```

The original temp ID may be retained as metadata.
