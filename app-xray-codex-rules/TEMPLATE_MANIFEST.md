# App X-Ray Template Manifest

## Purpose

The Template Manifest defines a portable app design package for App X-Ray.

A template is not just a PRD file.

A template may include:

- app type
- screens
- data objects
- flows
- roles
- permissions
- missing-parts checklist
- prompt packs
- sample data
- export settings

## Template Philosophy

Templates should help vibe coders start with a stable app structure.

A good template answers:

1. What screens should this app have?
2. What information should it store?
3. What user roles are common?
4. What flows are typical?
5. What decisions are commonly missing?
6. What prompt should I give to Codex/Cursor/Lovable/Replit?

## Manifest Shape

```ts
type AppXrayTemplateManifest = {
  schemaVersion: string;
  templateId: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  author?: TemplateAuthor;
  license?: string;
  pricing?: TemplatePricing;
  appTypes: string[];
  targetUsers: string[];
  screens: TemplateScreen[];
  dataObjects: TemplateDataObject[];
  dataRelations: TemplateDataRelation[];
  roles: TemplateRole[];
  permissions: TemplatePermission[];
  flows: TemplateFlow[];
  issues: TemplateIssue[];
  promptPacks: TemplatePromptPack[];
  sampleData?: TemplateSampleData[];
  exports?: TemplateExportPreset[];
};
```

## Author

```ts
type TemplateAuthor = {
  name: string;
  url?: string;
  contact?: string;
};
```

## Pricing

```ts
type TemplatePricing = {
  type: "free" | "paid" | "external";
  priceUsd?: number;
  marketplaceSku?: string;
};
```

## Screen

```ts
type TemplateScreen = {
  id: string;
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
  parentId?: string;
};
```

## Data Object

```ts
type TemplateDataObject = {
  id: string;
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
  fields: TemplateDataField[];
};
```

## Data Field

```ts
type TemplateDataField = {
  id: string;
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

## Data Relation

```ts
type TemplateDataRelation = {
  id: string;
  sourceObjectId: string;
  targetObjectId: string;
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

## Role

```ts
type TemplateRole = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
};
```

## Permission

```ts
type TemplatePermission = {
  id: string;
  roleId: string;
  targetType: "screen" | "feature" | "dataObject" | "project";
  targetId?: string;
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

## Flow

```ts
type TemplateFlow = {
  id: string;
  name: string;
  description?: string;
  primaryRoleId?: string;
  steps: TemplateFlowStep[];
};
```

## Flow Step

```ts
type TemplateFlowStep = {
  id: string;
  stepOrder: number;
  screenId?: string;
  actionDescription: string;
  dataObjectId?: string;
};
```

## Issue

```ts
type TemplateIssue = {
  id: string;
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
};
```

## Prompt Pack

```ts
type TemplatePromptPack = {
  id: string;
  targetTool: "codex" | "cursor" | "lovable" | "replit" | "bolt" | "generic";
  title: string;
  description?: string;
  prompt: string;
  includedScreenIds?: string[];
  includedDataObjectIds?: string[];
  excludedScope?: string[];
};
```

## Sample Data

```ts
type TemplateSampleData = {
  dataObjectId: string;
  records: Record<string, unknown>[];
};
```

## Export Preset

```ts
type TemplateExportPreset = {
  id: string;
  type: "markdown" | "mermaid" | "json" | "prompt";
  title: string;
};
```

## Template Application Rules

When applying a template to a project:

1. Do not overwrite existing user-confirmed objects silently.
2. Detect name collisions.
3. Show a preview before applying.
4. Let the user choose:
   - add all
   - add selected
   - merge with existing
   - cancel
5. Imported objects should start as `suggested` unless the user explicitly accepts them.
6. Keep template metadata for future updates.

## Marketplace Readiness Rules

A template is marketplace-ready only if:

- It has a valid manifest.
- It includes at least one screen.
- It includes at least one data object.
- It includes at least one flow or prompt pack.
- It has a clear category.
- It has a version.
- It can render in App Map and Data Map without broken references.
