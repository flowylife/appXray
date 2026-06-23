import type { AiBuildStepSuggestion } from "./ai-analysis.js";
import type { Project, SourceDocument, XraySuggestionSet } from "./types.js";

export type ProjectWorkspace = {
  project: Project;
  sourceDocuments: SourceDocument[];
  objects: XraySuggestionSet;
  buildPlanSuggestions: AiBuildStepSuggestion[];
  lastAnalysis?: WorkspaceAnalysisSummary;
  updatedAt: string;
};

export type WorkspaceAnalysisSummary = {
  sourceDocumentId: string;
  sourceVersion: number;
  analyzedAt: string;
  incomingSuggestedCount: number;
  addedSuggestedCount: number;
  refreshedSuggestedCount: number;
  preservedConfirmedCount: number;
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
