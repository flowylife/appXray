import type { AiAnalysisResult } from "../domain/ai-analysis.js";
import { mockAiProviderAdapter, validateAiAnalysisResult } from "../ai/adapter.js";
import { analyzeWithHttpProvider, type HttpProviderResult } from "../ai/http-provider.js";
import type { AiProviderConfig } from "../ai/settings.js";
import { convertAiAnalysisToXrayObjects } from "../domain/convert.js";
import { compareSuggestionSets } from "../domain/diff.js";
import {
  mergeAiSuggestionsPreservingConfirmed,
  summarizeSuggestionMergeImpact,
} from "../domain/lifecycle.js";
import type { SourceDocument } from "../domain/types.js";
import type { ProjectWorkspace } from "../domain/workspace.js";

export type WorkspaceAnalysisFailureStatus = "validation-failed" | "provider-error";

export type WorkspaceAnalysisResult =
  | {
    ok: true;
    workspace: ProjectWorkspace;
    message: string;
  }
  | {
    ok: false;
    status: WorkspaceAnalysisFailureStatus;
    message: string;
  };

export type WorkspaceAnalysisRunnerOptions = {
  analyzeWithMock?: (input: { sourceDocument: SourceDocument }) => Promise<AiAnalysisResult>;
  analyzeWithHttp?: typeof analyzeWithHttpProvider;
  createRunId?: () => string;
};

export type RunWorkspaceAnalysisInput = {
  aiConfig: AiProviderConfig;
  workspace: ProjectWorkspace;
  sourceDocument: SourceDocument;
  now?: string;
};

export async function runWorkspaceAnalysis(
  input: RunWorkspaceAnalysisInput,
  options: WorkspaceAnalysisRunnerOptions = {},
): Promise<WorkspaceAnalysisResult> {
  const now = input.now ?? new Date().toISOString();
  const analyzeWithMock = options.analyzeWithMock ?? mockAiProviderAdapter.analyze;
  const analyzeWithHttp = options.analyzeWithHttp ?? analyzeWithHttpProvider;
  const createRunId = options.createRunId ?? (() => `analysis_${crypto.randomUUID()}`);

  let analysis: AiAnalysisResult;
  try {
    if (input.aiConfig.provider === "mock") {
      analysis = await analyzeWithMock({ sourceDocument: input.sourceDocument });
    } else {
      const providerResult = await analyzeWithHttp(input.aiConfig, { sourceDocument: input.sourceDocument });
      if (!providerResult.ok) return providerFailure(providerResult);
      analysis = providerResult.result;
    }
  } catch (error) {
    return {
      ok: false,
      status: "provider-error",
      message: error instanceof Error ? error.message : "AI 분석 요청에 실패했습니다.",
    };
  }

  const validation = validateAiAnalysisResult(analysis);
  if (!validation.ok) {
    return {
      ok: false,
      status: "validation-failed",
      message: `AI 분석 결과 검증 실패: ${validation.errors.join(" / ")}`,
    };
  }

  const converted = convertAiAnalysisToXrayObjects({
    project: input.workspace.project,
    sourceDocument: input.sourceDocument,
    analysis: validation.result,
    now,
  });
  const mergeImpact = summarizeSuggestionMergeImpact(input.workspace.objects, converted);
  const mergedObjects = mergeAiSuggestionsPreservingConfirmed(input.workspace.objects, converted);
  const structureDiff = compareSuggestionSets(input.workspace.objects, mergedObjects);
  const lastAnalysis = {
    runId: createRunId(),
    sourceDocumentId: input.sourceDocument.id,
    sourceVersion: input.sourceDocument.version,
    analyzedAt: now,
    ...mergeImpact,
  };

  return {
    ok: true,
    message: "AI 분석 결과를 suggested 구조로 반영했습니다.",
    workspace: {
      ...input.workspace,
      project: {
        ...input.workspace.project,
        appTypes: validation.result.summary.appTypes,
        updatedAt: now,
      },
      objects: mergedObjects,
      buildPlanSuggestions: converted.buildPlanSuggestions,
      lastAnalysis,
      analysisHistory: [lastAnalysis, ...(input.workspace.analysisHistory ?? [])].slice(0, 10),
      lastStructureDiff: structureDiff,
      updatedAt: now,
    },
  };
}

function providerFailure(providerResult: Extract<HttpProviderResult, { ok: false }>): WorkspaceAnalysisResult {
  return {
    ok: false,
    status: "provider-error",
    message: providerResult.error,
  };
}
