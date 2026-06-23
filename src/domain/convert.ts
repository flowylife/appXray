import type {
  AiAnalysisResult,
  AiBuildStepSuggestion,
  AiDataFieldSuggestion,
  AiSuggestionBase,
} from "./ai-analysis.js";
import { toConfidenceBand } from "./status.js";
import type {
  BaseXrayObject,
  DataField,
  DataObject,
  DataRelation,
  Feature,
  Flow,
  FlowStep,
  Issue,
  Permission,
  Project,
  Screen,
  SourceDocument,
  UserRole,
  XraySuggestionSet,
} from "./types.js";

export type StableIdFactory = (kind: StableIdKind, tempId: string) => string;

export type StableIdKind =
  | "requirement"
  | "screen"
  | "feature"
  | "dataObject"
  | "dataField"
  | "dataRelation"
  | "role"
  | "permission"
  | "flow"
  | "flowStep"
  | "issue";

export type UnresolvedReference = {
  ownerTempId: string;
  field: string;
  missingTempId: string;
};

export type ConvertAiAnalysisInput = {
  project: Project;
  sourceDocument: SourceDocument;
  analysis: AiAnalysisResult;
  now?: string;
  idFactory?: StableIdFactory;
};

export type ConvertedAiAnalysis = XraySuggestionSet & {
  buildPlanSuggestions: AiBuildStepSuggestion[];
  unresolvedReferences: UnresolvedReference[];
};

const PREFIX_BY_KIND: Record<StableIdKind, string> = {
  requirement: "req",
  screen: "scr",
  feature: "feat",
  dataObject: "obj",
  dataField: "fld",
  dataRelation: "rel",
  role: "role",
  permission: "perm",
  flow: "flow",
  flowStep: "step",
  issue: "issue",
};

export function convertAiAnalysisToXrayObjects({
  project,
  sourceDocument,
  analysis,
  now = new Date().toISOString(),
  idFactory = defaultStableIdFactory,
}: ConvertAiAnalysisInput): ConvertedAiAnalysis {
  const unresolvedReferences: UnresolvedReference[] = [];
  const screenIds = mapIds(analysis.screens, "screen", idFactory);
  const featureIds = mapIds(analysis.features, "feature", idFactory);
  const dataObjectIds = mapIds(analysis.dataObjects, "dataObject", idFactory);
  const roleIds = mapIds(analysis.roles, "role", idFactory);
  const flowIds = mapIds(analysis.flows, "flow", idFactory);

  const requirements = analysis.requirements.map((suggestion): ConvertedAiAnalysis["requirements"][number] => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "requirement", now, idFactory),
    sourceDocumentId: sourceDocument.id,
    text: suggestion.text,
    requirementType: suggestion.requirementType,
    ...optional("priority", suggestion.priority),
  }));

  const screens = analysis.screens.map((suggestion, index): Screen => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "screen", now, idFactory),
    name: suggestion.name,
    ...optional("displayName", suggestion.displayName),
    ...optional("description", suggestion.description),
    screenType: suggestion.screenType,
    ...optional(
      "parentScreenId",
      resolveOptional(
        unresolvedReferences,
        suggestion.tempId,
        "parentScreenId",
        suggestion.parentTempId,
        screenIds,
      ),
    ),
    orderIndex: index,
  }));

  const features = analysis.features.map((suggestion): Feature => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "feature", now, idFactory),
    ...optional(
      "screenId",
      resolveOptional(
        unresolvedReferences,
        suggestion.tempId,
        "screenId",
        suggestion.screenTempId,
        screenIds,
      ),
    ),
    name: suggestion.name,
    ...optional("description", suggestion.description),
    actionType: suggestion.actionType,
  }));

  const dataObjects = analysis.dataObjects.map((suggestion): DataObject => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "dataObject", now, idFactory),
    name: suggestion.name,
    ...optional("displayName", suggestion.displayName),
    ...optional("description", suggestion.description),
    objectType: suggestion.objectType,
  }));

  const dataFields = analysis.dataObjects.flatMap((objectSuggestion): DataField[] => {
    const dataObjectId = dataObjectIds.get(objectSuggestion.tempId);
    if (!dataObjectId) return [];

    return objectSuggestion.fields.map((fieldSuggestion) =>
      convertDataField({
        projectId: project.id,
        sourceDocumentId: sourceDocument.id,
        dataObjectTempId: objectSuggestion.tempId,
        dataObjectId,
        suggestion: fieldSuggestion,
        now,
        idFactory,
      }),
    );
  });

  const dataRelations = analysis.dataRelations.flatMap((suggestion): DataRelation[] => {
    const sourceObjectId = resolveRequired(
      unresolvedReferences,
      suggestion.tempId,
      "sourceObjectId",
      suggestion.sourceObjectTempId,
      dataObjectIds,
    );
    const targetObjectId = resolveRequired(
      unresolvedReferences,
      suggestion.tempId,
      "targetObjectId",
      suggestion.targetObjectTempId,
      dataObjectIds,
    );
    if (!sourceObjectId || !targetObjectId) return [];

    return [
      {
        ...baseObject(project.id, sourceDocument.id, suggestion, "dataRelation", now, idFactory),
        sourceObjectId,
        targetObjectId,
        relationType: suggestion.relationType,
        ...optional("description", suggestion.description),
      },
    ];
  });

  const roles = analysis.roles.map((suggestion): UserRole => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "role", now, idFactory),
    name: suggestion.name,
    ...optional("displayName", suggestion.displayName),
    ...optional("description", suggestion.description),
  }));

  const permissions = analysis.permissions.flatMap((suggestion): Permission[] => {
    const roleId = resolveRequired(
      unresolvedReferences,
      suggestion.tempId,
      "roleId",
      suggestion.roleTempId,
      roleIds,
    );
    if (!roleId) return [];

    const targetId = resolvePermissionTarget(unresolvedReferences, suggestion, {
      screenIds,
      featureIds,
      dataObjectIds,
    });

    if (suggestion.targetType !== "project" && suggestion.targetTempId && !targetId) {
      return [];
    }

    return [
      {
        ...baseObject(project.id, sourceDocument.id, suggestion, "permission", now, idFactory),
        roleId,
        targetType: suggestion.targetType,
        ...optional("targetId", targetId),
        action: suggestion.action,
        allowed: suggestion.allowed,
      },
    ];
  });

  const flows = analysis.flows.map((suggestion): Flow => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "flow", now, idFactory),
    name: suggestion.name,
    ...optional("description", suggestion.description),
    ...optional(
      "primaryRoleId",
      resolveOptional(
        unresolvedReferences,
        suggestion.tempId,
        "primaryRoleId",
        suggestion.primaryRoleTempId,
        roleIds,
      ),
    ),
  }));

  const flowSteps = analysis.flows.flatMap((flowSuggestion): FlowStep[] => {
    const flowId = flowIds.get(flowSuggestion.tempId);
    if (!flowId) return [];

    return flowSuggestion.steps.map((stepSuggestion): FlowStep => ({
      ...baseObject(
        project.id,
        sourceDocument.id,
        stepSuggestion,
        "flowStep",
        now,
        (kind, tempId) => idFactory(kind, `${flowSuggestion.tempId}_${tempId}`),
      ),
      flowId,
      stepOrder: stepSuggestion.stepOrder,
      ...optional(
        "screenId",
        resolveOptional(
          unresolvedReferences,
          stepSuggestion.tempId,
          "screenId",
          stepSuggestion.screenTempId,
          screenIds,
        ),
      ),
      actionDescription: stepSuggestion.actionDescription,
      ...optional(
        "dataObjectId",
        resolveOptional(
          unresolvedReferences,
          stepSuggestion.tempId,
          "dataObjectId",
          stepSuggestion.dataObjectTempId,
          dataObjectIds,
        ),
      ),
      ...optional(
        "featureId",
        resolveOptional(
          unresolvedReferences,
          stepSuggestion.tempId,
          "featureId",
          stepSuggestion.featureTempId,
          featureIds,
        ),
      ),
    }));
  });

  const issues = analysis.issues.map((suggestion): Issue => ({
    ...baseObject(project.id, sourceDocument.id, suggestion, "issue", now, idFactory),
    issueType: suggestion.issueType,
    severity: suggestion.severity,
    title: suggestion.title,
    description: suggestion.description,
    ...optional("suggestion", suggestion.suggestion),
    ...optional(
      "relatedScreenId",
      resolveOptional(
        unresolvedReferences,
        suggestion.tempId,
        "relatedScreenId",
        suggestion.relatedScreenTempId,
        screenIds,
      ),
    ),
    ...optional(
      "relatedDataObjectId",
      resolveOptional(
        unresolvedReferences,
        suggestion.tempId,
        "relatedDataObjectId",
        suggestion.relatedDataObjectTempId,
        dataObjectIds,
      ),
    ),
    ...optional(
      "relatedFeatureId",
      resolveOptional(
        unresolvedReferences,
        suggestion.tempId,
        "relatedFeatureId",
        suggestion.relatedFeatureTempId,
        featureIds,
      ),
    ),
  }));

  return {
    requirements,
    screens,
    features,
    dataObjects,
    dataFields,
    dataRelations,
    roles,
    permissions,
    flows,
    flowSteps,
    issues,
    buildPlanSuggestions: analysis.buildPlan,
    unresolvedReferences,
  };
}

export function defaultStableIdFactory(kind: StableIdKind, tempId: string): string {
  const safeTempId = tempId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${PREFIX_BY_KIND[kind]}_${safeTempId || "unknown"}`;
}

function mapIds<T extends AiSuggestionBase>(
  suggestions: readonly T[],
  kind: StableIdKind,
  idFactory: StableIdFactory,
): Map<string, string> {
  return new Map(suggestions.map((suggestion) => [suggestion.tempId, idFactory(kind, suggestion.tempId)]));
}

function baseObject(
  projectId: string,
  sourceDocumentId: string,
  suggestion: AiSuggestionBase,
  kind: StableIdKind,
  now: string,
  idFactory: StableIdFactory,
): BaseXrayObject {
  return {
    id: idFactory(kind, suggestion.tempId),
    projectId,
    status: "suggested",
    confidence: suggestion.confidence,
    confidenceBand: toConfidenceBand(suggestion.confidence),
    sourceTrace: {
      sourceDocumentId,
      ...optional("quote", suggestion.sourceQuote),
    },
    origin: {
      kind: "ai",
      tempId: suggestion.tempId,
      ...optional("inferred", suggestion.inferred),
      ...optional("reasoning", suggestion.reasoning),
    },
    createdAt: now,
    updatedAt: now,
  };
}

function convertDataField({
  projectId,
  sourceDocumentId,
  dataObjectTempId,
  dataObjectId,
  suggestion,
  now,
  idFactory,
}: {
  projectId: string;
  sourceDocumentId: string;
  dataObjectTempId: string;
  dataObjectId: string;
  suggestion: AiDataFieldSuggestion;
  now: string;
  idFactory: StableIdFactory;
}): DataField {
  return {
    ...baseObject(projectId, sourceDocumentId, suggestion, "dataField", now, (kind, tempId) =>
      idFactory(kind, `${dataObjectTempId}_${tempId}`),
    ),
    dataObjectId,
    name: suggestion.name,
    ...optional("displayName", suggestion.displayName),
    fieldType: suggestion.fieldType,
    ...optional("required", suggestion.required),
    ...optional("enumValues", suggestion.enumValues),
    ...optional("description", suggestion.description),
  };
}

function resolvePermissionTarget(
  unresolvedReferences: UnresolvedReference[],
  suggestion: {
    tempId: string;
    targetType: Permission["targetType"];
    targetTempId?: string;
  },
  maps: {
    screenIds: Map<string, string>;
    featureIds: Map<string, string>;
    dataObjectIds: Map<string, string>;
  },
): string | undefined {
  if (suggestion.targetType === "project" || !suggestion.targetTempId) return undefined;

  if (suggestion.targetType === "screen") {
    return resolveRequired(unresolvedReferences, suggestion.tempId, "targetId", suggestion.targetTempId, maps.screenIds);
  }
  if (suggestion.targetType === "feature") {
    return resolveRequired(unresolvedReferences, suggestion.tempId, "targetId", suggestion.targetTempId, maps.featureIds);
  }
  return resolveRequired(unresolvedReferences, suggestion.tempId, "targetId", suggestion.targetTempId, maps.dataObjectIds);
}

function resolveOptional(
  unresolvedReferences: UnresolvedReference[],
  ownerTempId: string,
  field: string,
  tempId: string | undefined,
  ids: Map<string, string>,
): string | undefined {
  if (!tempId) return undefined;
  return resolveRequired(unresolvedReferences, ownerTempId, field, tempId, ids);
}

function resolveRequired(
  unresolvedReferences: UnresolvedReference[],
  ownerTempId: string,
  field: string,
  tempId: string,
  ids: Map<string, string>,
): string | undefined {
  const id = ids.get(tempId);
  if (id) return id;

  unresolvedReferences.push({
    ownerTempId,
    field,
    missingTempId: tempId,
  });
  return undefined;
}

function optional<K extends string, V>(
  key: K,
  value: V | undefined,
): V extends undefined ? Record<string, never> : Partial<Record<K, V>> {
  if (value === undefined) return {} as V extends undefined ? Record<string, never> : Partial<Record<K, V>>;
  return { [key]: value } as V extends undefined ? Record<string, never> : Partial<Record<K, V>>;
}
