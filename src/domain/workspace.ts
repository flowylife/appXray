import type { AiBuildStepSuggestion } from "./ai-analysis.js";
import type { StructureDiffReport } from "./diff.js";
import type { Project, SourceDocument, XraySuggestionSet } from "./types.js";

export type ProjectWorkspace = {
  project: Project;
  sourceDocuments: SourceDocument[];
  objects: XraySuggestionSet;
  buildPlanSuggestions: AiBuildStepSuggestion[];
  lastAnalysis?: WorkspaceAnalysisSummary;
  analysisHistory?: WorkspaceAnalysisSummary[];
  lastStructureDiff?: StructureDiffReport;
  updatedAt: string;
};

export type XraySuggestionBucket = keyof XraySuggestionSet;

export type AnalysisChangeType =
  | "added_suggestion"
  | "refreshed_suggestion"
  | "preserved_confirmed";

export type AnalysisChange = {
  bucket: XraySuggestionBucket;
  objectId: string;
  changeType: AnalysisChangeType;
};

export type WorkspaceAnalysisSummary = {
  runId: string;
  sourceDocumentId: string;
  sourceVersion: number;
  analyzedAt: string;
  incomingSuggestedCount: number;
  addedSuggestedCount: number;
  refreshedSuggestedCount: number;
  preservedConfirmedCount: number;
  changes: AnalysisChange[];
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
