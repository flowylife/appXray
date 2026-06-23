import type { AiBuildStepSuggestion } from "./ai-analysis.js";
import type { Project, SourceDocument, XraySuggestionSet } from "./types.js";

export type ProjectWorkspace = {
  project: Project;
  sourceDocuments: SourceDocument[];
  objects: XraySuggestionSet;
  buildPlanSuggestions: AiBuildStepSuggestion[];
  updatedAt: string;
};

export function createEmptySuggestionSet(): XraySuggestionSet {
  return {
    requirements: [],
    screens: [],
    features: [],
    dataObjects: [],
    dataFields: [],
    dataRelations: [],
    roles: [],
    permissions: [],
    flows: [],
    flowSteps: [],
    issues: [],
  };
}
