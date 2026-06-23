import type {
  ActionType,
  DataFieldType,
  DataObjectType,
  IssueType,
  PermissionAction,
  PermissionTargetType,
  RelationType,
  RequirementType,
  ScreenType,
} from "./types.js";

export type AiAnalysisResult = {
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

export type AiAnalysisSummary = {
  appName?: string;
  appTypes: string[];
  confidence: number;
  plainLanguageSummary: string;
  targetUsers?: string[];
};

export type AiSuggestionBase = {
  tempId: string;
  confidence: number;
  sourceQuote?: string;
  inferred?: boolean;
  reasoning?: string;
};

export type AiRequirementSuggestion = AiSuggestionBase & {
  text: string;
  requirementType: RequirementType;
  priority?: "low" | "medium" | "high";
};

export type AiScreenSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  description?: string;
  screenType: ScreenType;
  parentTempId?: string;
  relatedRequirementTempIds?: string[];
};

export type AiFeatureSuggestion = AiSuggestionBase & {
  name: string;
  description?: string;
  actionType: ActionType;
  screenTempId?: string;
  relatedRequirementTempIds?: string[];
};

export type AiDataObjectSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  description?: string;
  objectType: DataObjectType;
  fields: AiDataFieldSuggestion[];
};

export type AiDataFieldSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  fieldType: DataFieldType;
  required?: boolean;
  enumValues?: string[];
  description?: string;
};

export type AiDataRelationSuggestion = AiSuggestionBase & {
  sourceObjectTempId: string;
  targetObjectTempId: string;
  relationType: RelationType;
  description?: string;
};

export type AiRoleSuggestion = AiSuggestionBase & {
  name: string;
  displayName?: string;
  description?: string;
};

export type AiPermissionSuggestion = AiSuggestionBase & {
  roleTempId: string;
  targetType: PermissionTargetType;
  targetTempId?: string;
  action: PermissionAction;
  allowed: boolean;
};

export type AiFlowSuggestion = AiSuggestionBase & {
  name: string;
  description?: string;
  primaryRoleTempId?: string;
  steps: AiFlowStepSuggestion[];
};

export type AiFlowStepSuggestion = AiSuggestionBase & {
  stepOrder: number;
  screenTempId?: string;
  actionDescription: string;
  dataObjectTempId?: string;
  featureTempId?: string;
};

export type AiIssueSuggestion = AiSuggestionBase & {
  issueType: IssueType;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggestion?: string;
  relatedScreenTempId?: string;
  relatedDataObjectTempId?: string;
  relatedFeatureTempId?: string;
};

export type AiBuildStepSuggestion = AiSuggestionBase & {
  title: string;
  description: string;
  includedScreenTempIds?: string[];
  includedDataObjectTempIds?: string[];
  excludedScope?: string[];
  completionCriteria?: string[];
};
