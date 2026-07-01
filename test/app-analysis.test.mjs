import assert from "node:assert/strict";
import { test } from "node:test";

import { runWorkspaceAnalysis } from "../dist/app/run-analysis.js";
import { DEFAULT_AI_PROVIDER_CONFIG } from "../dist/ai/settings.js";
import { applyStatusDecisionToSuggestionSet } from "../dist/domain/lifecycle.js";
import { getLatestSourceDocument } from "../dist/domain/source-documents.js";
import { createProjectWorkspace } from "../dist/storage/project-repository.js";

test("workspace analysis service creates reviewable suggestions and preserves confirmed reruns", async () => {
  const workspace = createProjectWorkspace({
    name: "분석 서비스 테스트",
    sourceText: "현장 작업자가 설비 점검 기록을 만들고 관리자가 누락 항목을 검토하는 앱",
    sourceType: "text",
    now: "2026-07-01T00:00:00.000Z",
    projectId: "project_analysis_service",
    sourceDocumentId: "source_analysis_service",
  });
  const sourceDocument = getLatestSourceDocument(workspace);
  assert.ok(sourceDocument);

  const firstRun = await runWorkspaceAnalysis(
    {
      aiConfig: DEFAULT_AI_PROVIDER_CONFIG,
      workspace,
      sourceDocument,
      now: "2026-07-01T00:01:00.000Z",
    },
    { createRunId: () => "analysis_first" },
  );

  assert.equal(firstRun.ok, true);
  assert.ok(firstRun.workspace.objects.screens.length > 0);
  assert.equal(firstRun.workspace.lastAnalysis?.runId, "analysis_first");
  assert.equal(firstRun.workspace.analysisHistory?.length, 1);

  const confirmedScreen = firstRun.workspace.objects.screens[0];
  assert.ok(confirmedScreen);
  const reviewedObjects = applyStatusDecisionToSuggestionSet(
    firstRun.workspace.objects,
    "screens",
    [confirmedScreen.id],
    "accepted",
    "2026-07-01T00:02:00.000Z",
  ).objects;
  const reviewedWorkspace = {
    ...firstRun.workspace,
    objects: reviewedObjects,
  };
  const rerunSourceDocument = getLatestSourceDocument(reviewedWorkspace);
  assert.ok(rerunSourceDocument);

  const rerun = await runWorkspaceAnalysis(
    {
      aiConfig: DEFAULT_AI_PROVIDER_CONFIG,
      workspace: reviewedWorkspace,
      sourceDocument: rerunSourceDocument,
      now: "2026-07-01T00:03:00.000Z",
    },
    { createRunId: () => "analysis_second" },
  );

  assert.equal(rerun.ok, true);
  assert.equal(rerun.workspace.analysisHistory?.map((analysis) => analysis.runId).join(","), "analysis_second,analysis_first");
  assert.equal(
    rerun.workspace.objects.screens.find((screen) => screen.id === confirmedScreen.id)?.status,
    "accepted",
  );
  assert.equal(rerun.workspace.lastAnalysis?.preservedConfirmedCount, 1);
});

test("workspace analysis service reports provider and contract failures without mutating workspace", async () => {
  const workspace = createProjectWorkspace({
    name: "실패 경로 테스트",
    sourceText: "사용자가 확인할 수 없는 provider 실패를 보여준다",
    sourceType: "text",
    now: "2026-07-01T00:00:00.000Z",
  });
  const sourceDocument = getLatestSourceDocument(workspace);
  assert.ok(sourceDocument);

  const providerFailure = await runWorkspaceAnalysis(
    {
      aiConfig: {
        ...DEFAULT_AI_PROVIDER_CONFIG,
        provider: "openai",
        modelName: "gpt-test",
        apiKeyPresent: false,
      },
      workspace,
      sourceDocument,
    },
    {
      analyzeWithHttp: async () => ({
        ok: false,
        provider: "openai",
        modelName: "gpt-test",
        checkedAt: "2026-07-01T00:00:00.000Z",
        code: "missing_api_key",
        error: "API key is required.",
      }),
    },
  );

  assert.deepEqual(providerFailure, {
    ok: false,
    status: "provider-error",
    message: "API key is required.",
  });

  const invalidContract = await runWorkspaceAnalysis(
    {
      aiConfig: DEFAULT_AI_PROVIDER_CONFIG,
      workspace,
      sourceDocument,
    },
    {
      analyzeWithMock: async () => ({ summary: { appTypes: [], confidence: 1, plainLanguageSummary: "bad" } }),
    },
  );

  assert.equal(invalidContract.ok, false);
  assert.equal(invalidContract.status, "validation-failed");
  assert.match(invalidContract.message, /requirements는 배열이어야 합니다/);
});
