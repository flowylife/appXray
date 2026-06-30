export type SuggestionStatus =
  | "suggested"
  | "accepted"
  | "edited"
  | "rejected"
  | "deferred";

export type ConfirmedSuggestionStatus = Extract<
  SuggestionStatus,
  "accepted" | "edited"
>;

export type ConfidenceBand = "likely" | "review" | "weak";

export type SourceTrace = {
  sourceDocumentId?: string;
  quote?: string;
  sectionTitle?: string;
  startOffset?: number;
  endOffset?: number;
};

export type AiOrigin = {
  kind: "ai" | "template";
  tempId: string;
  inferred?: boolean;
  reasoning?: string;
  templateId?: string;
};

export type BaseXrayObject = {
  id: string;
  projectId: string;
  status: SuggestionStatus;
  confidence?: number;
  confidenceBand?: ConfidenceBand;
  sourceTrace?: SourceTrace;
  origin?: AiOrigin;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  appTypes: string[];
  createdAt: string;
  updatedAt: string;
};

export type SourceDocument = {
  id: string;
  projectId: string;
  title: string;
  content: string;
  sourceType: "text" | "markdown" | "txt" | "csv" | "json" | "pdf" | "imported";
  version: number;
  createdAt: string;
};

export type RequirementType =
  | "screen"
  | "feature"
  | "data"
  | "permission"
  | "flow"
  | "non_functional"
  | "business_rule"
  | "unknown";

export type Requirement = BaseXrayObject & {
  sourceDocumentId: string;
  text: string;
  requirementType: RequirementType;
  priority?: "low" | "medium" | "high";
};

export type ScreenType =
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

export type Screen = BaseXrayObject & {
  name: string;
  displayName?: string;
  description?: string;
  screenType: ScreenType;
  parentScreenId?: string;
  orderIndex?: number;
};

export type ActionType =
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

export type Feature = BaseXrayObject & {
  screenId?: string;
  name: string;
  description?: string;
  actionType: ActionType;
};

export type DataObjectType =
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

export type DataObject = BaseXrayObject & {
  name: string;
  displayName?: string;
  description?: string;
  objectType: DataObjectType;
};

export type DataFieldType =
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

export type DataField = BaseXrayObject & {
  dataObjectId: string;
  name: string;
  displayName?: string;
  fieldType: DataFieldType;
  required?: boolean;
  enumValues?: string[];
  description?: string;
};

export type RelationType =
  | "one_to_one"
  | "one_to_many"
  | "many_to_one"
  | "many_to_many"
  | "contains"
  | "references"
  | "owns"
  | "creates"
  | "unknown";

export type DataRelation = BaseXrayObject & {
  sourceObjectId: string;
  targetObjectId: string;
  relationType: RelationType;
  description?: string;
};

export type UserRole = BaseXrayObject & {
  name: string;
  displayName?: string;
  description?: string;
};

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "approve"
  | "manage";

export type PermissionTargetType = "screen" | "feature" | "dataObject" | "project";

export type Permission = BaseXrayObject & {
  roleId: string;
  targetType: PermissionTargetType;
  targetId?: string;
  action: PermissionAction;
  allowed: boolean;
};

export type Flow = BaseXrayObject & {
  name: string;
  description?: string;
  primaryRoleId?: string;
};

export type FlowStep = BaseXrayObject & {
  flowId: string;
  stepOrder: number;
  screenId?: string;
  actionDescription: string;
  dataObjectId?: string;
  featureId?: string;
};

export type IssueType =
  | "missing"
  | "ambiguous"
  | "conflict"
  | "data_gap"
  | "permission_gap"
  | "state_gap"
  | "exception_gap"
  | "scope_risk";

export type Issue = BaseXrayObject & {
  issueType: IssueType;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggestion?: string;
  resolutionNote?: string;
  includeInPrompt?: boolean;
  relatedScreenId?: string;
  relatedDataObjectId?: string;
  relatedFeatureId?: string;
};

export type ExportArtifact = {
  id: string;
  projectId: string;
  artifactType:
    | "markdown"
    | "mermaid"
    | "json"
    | "codex_prompt"
    | "cursor_prompt"
    | "lovable_prompt"
    | "replit_prompt"
    | "github_issues_markdown";
  content: string;
  createdAt: string;
};

export type XrayObject =
  | Requirement
  | Screen
  | Feature
  | DataObject
  | DataField
  | DataRelation
  | UserRole
  | Permission
  | Flow
  | FlowStep
  | Issue;

export type XraySuggestionSet = {
  requirements: Requirement[];
  screens: Screen[];
  features: Feature[];
  dataObjects: DataObject[];
  dataFields: DataField[];
  dataRelations: DataRelation[];
  roles: UserRole[];
  permissions: Permission[];
  flows: Flow[];
  flowSteps: FlowStep[];
  issues: Issue[];
};
