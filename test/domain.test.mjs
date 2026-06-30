import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAiAnalysisResult } from "../dist/ai/adapter.js";
import { loadAiProviderConfig, saveAiProviderConfig, toPublicAiProviderConfig } from "../dist/ai/settings.js";
import { compareSuggestionSets } from "../dist/domain/diff.js";
import { parseAppRoute, projectRoute } from "../dist/domain/routes.js";
import { fieldPowerAppSuggestionSet, mockFieldPowerAppAnalysis } from "../dist/fixtures/field-power-app.js";
import {
  applyStatusDecisionToSuggestionSet,
  updateXrayObjectStatus,
  editXrayObject,
  mergeAiSuggestionsPreservingConfirmed,
  summarizeSuggestionMergeImpact,
  undoLatestStatusDecision,
} from "../dist/domain/lifecycle.js";
import {
  appendSourceDocumentVersion,
  createSourceDocumentVersion,
  getLatestSourceDocument,
} from "../dist/domain/source-documents.js";
import { classifyPastedSource, classifySourceFile } from "../dist/domain/source-import.js";
import {
  getDefaultExportableObjects,
  isConfirmedStatus,
  isConfirmedXrayObject,
} from "../dist/domain/status.js";
import { validateWorkspace } from "../dist/domain/validation.js";
import { getValidationRepairActionLabel, getValidationReviewRoute } from "../dist/domain/validation-actions.js";
import { applyTemplateToWorkspace, validateTemplateManifest } from "../dist/domain/template.js";
import { fieldPowerAppProject, fieldPowerAppSourceDocument } from "../dist/fixtures/field-power-app.js";
import { fieldPowerTemplate } from "../dist/fixtures/field-power-template.js";
import { exportGithubIssuesMarkdown } from "../dist/export/github-issues.js";
import { exportProjectJson } from "../dist/export/json.js";
import { exportProjectMarkdown } from "../dist/export/markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "../dist/export/mermaid.js";
import { exportDataObjectsCsv, exportIssuesCsv } from "../dist/export/csv.js";
import { createExportBundle, getExportContent, getExportFileName } from "../dist/export/export-content.js";
import { createBuildPrompt } from "../dist/prompt/build-prompt.js";
import {
  createLocalStorageProjectRepository,
  createProjectWorkspace,
  loadProjectCollection,
  loadProjectWorkspace,
  summarizeProjects,
} from "../dist/storage/project-repository.js";
import { importWorkspaceBackup, serializeWorkspaceBackup } from "../dist/storage/workspace-backup.js";

test("confirmed status only includes accepted and edited", () => {
  assert.equal(isConfirmedStatus("suggested"), false);
  assert.equal(isConfirmedStatus("accepted"), true);
  assert.equal(isConfirmedStatus("edited"), true);
  assert.equal(isConfirmedStatus("rejected"), false);
  assert.equal(isConfirmedStatus("deferred"), false);
});

test("mock AI analysis converts to suggested canonical candidates", () => {
  const allObjects = [
    ...fieldPowerAppSuggestionSet.requirements,
    ...fieldPowerAppSuggestionSet.screens,
    ...fieldPowerAppSuggestionSet.features,
    ...fieldPowerAppSuggestionSet.dataObjects,
    ...fieldPowerAppSuggestionSet.dataFields,
    ...fieldPowerAppSuggestionSet.dataRelations,
    ...fieldPowerAppSuggestionSet.roles,
    ...fieldPowerAppSuggestionSet.permissions,
    ...fieldPowerAppSuggestionSet.flows,
    ...fieldPowerAppSuggestionSet.flowSteps,
    ...fieldPowerAppSuggestionSet.issues,
  ];

  assert.ok(allObjects.length > 0);
  assert.equal(fieldPowerAppSuggestionSet.unresolvedReferences.length, 0);
  assert.ok(allObjects.every((object) => object.status === "suggested"));
  assert.ok(allObjects.every((object) => object.origin?.kind === "ai"));
  assert.ok(allObjects.every((object) => object.sourceTrace?.sourceDocumentId === "src_field_power_prd"));
});

test("default export helper excludes suggested rejected and deferred records", () => {
  const [baseScreen] = fieldPowerAppSuggestionSet.screens;
  assert.ok(baseScreen);

  const objects = [
    { ...baseScreen, id: "screen_suggested", status: "suggested" },
    { ...baseScreen, id: "screen_accepted", status: "accepted" },
    { ...baseScreen, id: "screen_edited", status: "edited" },
    { ...baseScreen, id: "screen_rejected", status: "rejected" },
    { ...baseScreen, id: "screen_deferred", status: "deferred" },
  ];

  assert.equal(isConfirmedXrayObject(objects[0]), false);
  const exportable = getDefaultExportableObjects(objects);

  assert.deepEqual(
    exportable.map((object) => object.id),
    ["screen_accepted", "screen_edited"],
  );
});

test("editing an AI suggestion marks it as edited and preserves origin", () => {
  const [screen] = fieldPowerAppSuggestionSet.screens;
  assert.ok(screen);

  const edited = editXrayObject(screen, { displayName: "수정된 대시보드" }, "2026-06-23T01:00:00.000Z");

  assert.equal(edited.status, "edited");
  assert.equal(edited.displayName, "수정된 대시보드");
  assert.deepEqual(edited.origin, screen.origin);
  assert.equal(edited.updatedAt, "2026-06-23T01:00:00.000Z");
});

test("editing an issue updates decision fields and marks it as edited", () => {
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(issue);

  const edited = editXrayObject(
    issue,
    {
      title: "수정된 결정 필요 항목",
      description: "사용자가 설명을 명확히 고쳤습니다.",
      suggestion: "상태 값을 먼저 확정하세요.",
      resolutionNote: "알람 기준은 high/medium/low로 시작한다.",
      includeInPrompt: false,
    },
    "2026-06-23T01:00:00.000Z",
  );

  assert.equal(edited.status, "edited");
  assert.equal(edited.title, "수정된 결정 필요 항목");
  assert.equal(edited.description, "사용자가 설명을 명확히 고쳤습니다.");
  assert.equal(edited.suggestion, "상태 값을 먼저 확정하세요.");
  assert.equal(edited.resolutionNote, "알람 기준은 high/medium/low로 시작한다.");
  assert.equal(edited.includeInPrompt, false);
  assert.deepEqual(edited.origin, issue.origin);
});

test("AI rerun merge does not overwrite reviewed structures", () => {
  const [screen, deferredScreen, rejectedScreen] = fieldPowerAppSuggestionSet.screens;
  assert.ok(screen);
  assert.ok(deferredScreen);
  assert.ok(rejectedScreen);

  const accepted = updateXrayObjectStatus(screen, "accepted", "2026-06-23T01:00:00.000Z");
  const editedIncoming = { ...screen, displayName: "AI rerun changed this", status: "suggested" };
  const merged = mergeAiSuggestionsPreservingConfirmed(
    { ...fieldPowerAppSuggestionSet, screens: [accepted] },
    { ...fieldPowerAppSuggestionSet, screens: [editedIncoming] },
  );

  assert.equal(merged.screens.length, 1);
  assert.equal(merged.screens[0].status, "accepted");
  assert.equal(merged.screens[0].displayName, accepted.displayName);

  const edited = editXrayObject(screen, { displayName: "사용자가 고친 대시보드" }, "2026-06-23T01:30:00.000Z");
  const editedMerge = mergeAiSuggestionsPreservingConfirmed(
    { ...fieldPowerAppSuggestionSet, screens: [edited] },
    { ...fieldPowerAppSuggestionSet, screens: [editedIncoming] },
  );

  assert.equal(editedMerge.screens.length, 1);
  assert.equal(editedMerge.screens[0].status, "edited");
  assert.equal(editedMerge.screens[0].displayName, "사용자가 고친 대시보드");

  const deferred = updateXrayObjectStatus(deferredScreen, "deferred", "2026-06-23T01:40:00.000Z");
  const rejected = updateXrayObjectStatus(rejectedScreen, "rejected", "2026-06-23T01:45:00.000Z");
  const auditMerge = mergeAiSuggestionsPreservingConfirmed(
    { ...emptySuggestionSetForTest(), screens: [deferred, rejected] },
    {
      ...emptySuggestionSetForTest(),
      screens: [
        { ...deferredScreen, displayName: "AI rerun should not reset deferred", status: "suggested" },
        { ...rejectedScreen, displayName: "AI rerun should not reset rejected", status: "suggested" },
      ],
    },
  );

  assert.equal(auditMerge.screens[0].status, "deferred");
  assert.equal(auditMerge.screens[0].displayName, deferred.displayName);
  assert.equal(auditMerge.screens[1].status, "rejected");
  assert.equal(auditMerge.screens[1].displayName, rejected.displayName);
});

test("bulk status decisions accept only the requested bucket", () => {
  const screenIds = fieldPowerAppSuggestionSet.screens.slice(0, 2).map((screen) => screen.id);
  const result = applyStatusDecisionToSuggestionSet(
    {
      ...emptySuggestionSetForTest(),
      screens: fieldPowerAppSuggestionSet.screens.slice(0, 2),
      dataObjects: fieldPowerAppSuggestionSet.dataObjects.slice(0, 1),
    },
    "screens",
    screenIds,
    "accepted",
    "2026-07-01T01:00:00.000Z",
    "decision_accept_screens",
  );

  assert.ok(result.decisionGroup);
  assert.equal(result.decisionGroup.decisions.length, 2);
  assert.ok(result.objects.screens.every((screen) => screen.status === "accepted"));
  assert.equal(result.objects.dataObjects[0].status, "suggested");
});

test("bulk status decisions reject only the requested bucket", () => {
  const issueIds = fieldPowerAppSuggestionSet.issues.slice(0, 2).map((issue) => issue.id);
  const result = applyStatusDecisionToSuggestionSet(
    {
      ...emptySuggestionSetForTest(),
      screens: fieldPowerAppSuggestionSet.screens.slice(0, 1),
      issues: fieldPowerAppSuggestionSet.issues.slice(0, 2),
    },
    "issues",
    issueIds,
    "rejected",
    "2026-07-01T01:05:00.000Z",
    "decision_reject_issues",
  );

  assert.ok(result.decisionGroup);
  assert.equal(result.decisionGroup.decisions.length, 2);
  assert.ok(result.objects.issues.every((issue) => issue.status === "rejected"));
  assert.equal(result.objects.screens[0].status, "suggested");
});

test("undo restores the most recent status decision in the current session", () => {
  const screen = fieldPowerAppSuggestionSet.screens[0];
  const issue = fieldPowerAppSuggestionSet.issues[0];
  assert.ok(screen);
  assert.ok(issue);

  const acceptedScreen = applyStatusDecisionToSuggestionSet(
    { ...emptySuggestionSetForTest(), screens: [screen], issues: [issue] },
    "screens",
    [screen.id],
    "accepted",
    "2026-07-01T01:10:00.000Z",
    "decision_accept_screen",
  );
  const rejectedIssue = applyStatusDecisionToSuggestionSet(
    acceptedScreen.objects,
    "issues",
    [issue.id],
    "rejected",
    "2026-07-01T01:11:00.000Z",
    "decision_reject_issue",
  );
  const history = [acceptedScreen.decisionGroup, rejectedIssue.decisionGroup].filter(Boolean);

  const firstUndo = undoLatestStatusDecision(rejectedIssue.objects, history);
  assert.equal(firstUndo.restoredCount, 1);
  assert.equal(firstUndo.objects.issues[0].status, "suggested");
  assert.equal(firstUndo.objects.screens[0].status, "accepted");

  const secondUndo = undoLatestStatusDecision(firstUndo.objects, firstUndo.history);
  assert.equal(secondUndo.restoredCount, 1);
  assert.equal(secondUndo.objects.screens[0].status, "suggested");
});

test("deterministic exports and prompt use confirmed records only", () => {
  const [screen] = fieldPowerAppSuggestionSet.screens;
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  const [flow] = fieldPowerAppSuggestionSet.flows;
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(screen);
  assert.ok(dataObject);
  assert.ok(flow);
  assert.ok(issue);

  const workspace = {
    project: fieldPowerAppProject,
    sourceDocuments: [fieldPowerAppSourceDocument],
    objects: {
      ...fieldPowerAppSuggestionSet,
      screens: [updateXrayObjectStatus(screen, "accepted")],
      dataObjects: [updateXrayObjectStatus(dataObject, "edited")],
      flows: [updateXrayObjectStatus(flow, "accepted")],
      issues: [updateXrayObjectStatus(issue, "rejected")],
    },
    buildPlanSuggestions: [],
    updatedAt: "2026-06-23T01:00:00.000Z",
  };

  const markdown = exportProjectMarkdown(workspace);
  const appMermaid = exportAppMapMermaid(workspace);
  const dataMermaid = exportDataMapMermaid(workspace);
  const json = exportProjectJson(workspace);
  const prompt = createBuildPrompt(workspace, { targetTool: "codex" });

  assert.equal(markdown, exportProjectMarkdown(workspace));
  assert.match(markdown, /대시보드/);
  assert.doesNotMatch(markdown, /알람 발생 조건이 빠져 있음/);
  assert.match(appMermaid, /flowchart LR/);
  assert.match(dataMermaid, /erDiagram/);
  assert.equal(JSON.parse(json).objects.issues.length, 0);
  assert.match(prompt, /Confirmed app screens/);
  assert.doesNotMatch(prompt, /알람 발생 조건이 빠져 있음/);
});

test("build prompt includes confirmed issue notes unless explicitly excluded", () => {
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(issue);

  const includedWorkspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      issues: [
        updateXrayObjectStatus(
          {
            ...issue,
            resolutionNote: "사용자가 알람 기준을 먼저 확정했다.",
          },
          "accepted",
        ),
      ],
    },
  });
  const excludedWorkspace = {
    ...includedWorkspace,
    objects: {
      ...includedWorkspace.objects,
      issues: [{ ...includedWorkspace.objects.issues[0], includeInPrompt: false }],
    },
  };

  assert.match(createBuildPrompt(includedWorkspace, { targetTool: "cursor" }), /User note: 사용자가 알람 기준/);
  assert.match(createBuildPrompt(includedWorkspace, { targetTool: "cursor" }), /Cursor/);
  assert.doesNotMatch(createBuildPrompt(excludedWorkspace, { targetTool: "cursor" }), /알람 발생 조건/);
});

test("markdown export includes the full confirmed structure", () => {
  const workspace = confirmedWorkspace();
  const markdown = exportProjectMarkdown(workspace);

  assert.match(markdown, /## Requirements/);
  assert.match(markdown, /## App Map/);
  assert.match(markdown, /## Data Map/);
  assert.match(markdown, /## Roles and Permissions/);
  assert.match(markdown, /## User Flows/);
  assert.match(markdown, /담당구역, 공장, 변전실, 부하를 관리해야 한다/);
  assert.match(markdown, /view_single_line/);
  assert.match(markdown, /checkedAt: date required/);
  assert.match(markdown, /contains -> 부하/);
  assert.match(markdown, /allow edit dataObject/);
  assert.match(markdown, /1\. 주요 알람을 확인한다/);
});

test("mermaid export omits relations when either endpoint is not confirmed", () => {
  const [source, target] = fieldPowerAppSuggestionSet.dataObjects;
  const [relation] = fieldPowerAppSuggestionSet.dataRelations;
  assert.ok(source);
  assert.ok(target);
  assert.ok(relation);

  const workspace = {
    ...confirmedWorkspace(),
    objects: {
      ...fieldPowerAppSuggestionSet,
      dataObjects: [updateXrayObjectStatus(source, "accepted"), updateXrayObjectStatus(target, "rejected")],
      dataRelations: [updateXrayObjectStatus(relation, "accepted")],
    },
  };

  const mermaid = exportDataMapMermaid(workspace);
  assert.doesNotMatch(mermaid, /\\|\\|--o\\{/);
});

test("export helpers return stable filenames and preview content", () => {
  const workspace = confirmedWorkspace({
    project: { ...fieldPowerAppProject, name: "현장 전력설비 관리 앱!" },
  });

  assert.equal(getExportFileName(workspace, "markdown"), "app-xray-현장-전력설비-관리-앱.md");
  assert.equal(getExportFileName(workspace, "appMermaid"), "app-xray-현장-전력설비-관리-앱-app-map.mmd");
  assert.equal(getExportFileName(workspace, "dataMermaid"), "app-xray-현장-전력설비-관리-앱-data-map.mmd");
  assert.equal(getExportFileName(workspace, "json"), "app-xray-현장-전력설비-관리-앱.json");
  assert.equal(getExportFileName(workspace, "codexPrompt"), "app-xray-현장-전력설비-관리-앱-codex.md");
  assert.equal(getExportFileName(workspace, "cursorPrompt"), "app-xray-현장-전력설비-관리-앱-cursor.md");
  assert.equal(getExportFileName(workspace, "bundle"), "app-xray-현장-전력설비-관리-앱-bundle.json");
  assert.equal(getExportFileName(workspace, "dataObjectsCsv"), "app-xray-현장-전력설비-관리-앱-data-objects.csv");
  assert.equal(getExportFileName(workspace, "issuesCsv"), "app-xray-현장-전력설비-관리-앱-issues.csv");
  assert.equal(getExportContent(workspace, "markdown"), exportProjectMarkdown(workspace));
  assert.equal(getExportContent(workspace, "json"), exportProjectJson(workspace));
  assert.equal(getExportContent(workspace, "codexPrompt"), createBuildPrompt(workspace, { targetTool: "codex" }));
  assert.equal(getExportContent(workspace, "dataObjectsCsv"), exportDataObjectsCsv(workspace));
  assert.equal(getExportContent(workspace, "issuesCsv"), exportIssuesCsv(workspace));
});

test("export bundle contains manifest metadata and deterministic confirmed-only files", () => {
  const workspace = confirmedWorkspace();
  const bundle = createExportBundle(workspace, {
    generatedAt: "2026-07-01T00:00:00.000Z",
    includeValidationAppendix: true,
  });
  const validation = validateWorkspace(workspace);

  assert.equal(bundle.projectId, workspace.project.id);
  assert.equal(bundle.manifest.appVersion, "0.0.0");
  assert.equal(bundle.manifest.exportMode, "confirmedOnly");
  assert.equal(bundle.manifest.generatedAt, "2026-07-01T00:00:00.000Z");
  assert.deepEqual(bundle.manifest.validationSummary, {
    errorCount: validation.errors.length,
    warningCount: validation.warnings.length,
    isExportSafe: validation.isExportSafe,
  });
  assert.deepEqual(
    bundle.files.map((file) => file.exportType),
    [
      "markdown",
      "appMermaid",
      "dataMermaid",
      "json",
      "dataObjectsCsv",
      "issuesCsv",
      "codexPrompt",
      "cursorPrompt",
      "githubIssues",
    ],
  );
  assert.deepEqual(
    bundle.manifest.files.map((file) => file.fileName),
    bundle.files.map((file) => file.fileName),
  );
  assert.match(bundle.files.find((file) => file.exportType === "json").content, /"objects"/);
  assert.match(bundle.files.find((file) => file.exportType === "dataObjectsCsv").content, /displayName/);
});

test("all export types preserve Korean text and stable content order", () => {
  const [firstScreen, secondScreen] = fieldPowerAppSuggestionSet.screens;
  const [firstFeature, secondFeature] = fieldPowerAppSuggestionSet.features;
  const [firstObject, secondObject] = fieldPowerAppSuggestionSet.dataObjects;
  const [firstField, secondField] = fieldPowerAppSuggestionSet.dataFields;
  const [firstIssue, secondIssue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(firstScreen);
  assert.ok(secondScreen);
  assert.ok(firstFeature);
  assert.ok(secondFeature);
  assert.ok(firstObject);
  assert.ok(secondObject);
  assert.ok(firstField);
  assert.ok(secondField);
  assert.ok(firstIssue);
  assert.ok(secondIssue);

  const stableWorkspace = confirmedWorkspace({
    project: { ...fieldPowerAppProject, name: "정렬 검증 앱" },
    objects: {
      ...emptySuggestionSetForTest(),
      screens: [
        updateXrayObjectStatus({ ...secondScreen, id: "screen_b", displayName: "부하 목록" }, "accepted"),
        updateXrayObjectStatus({ ...firstScreen, id: "screen_a", displayName: "대시보드" }, "accepted"),
      ],
      features: [
        updateXrayObjectStatus({ ...secondFeature, id: "feature_b", screenId: "screen_b", name: "목록 검색" }, "accepted"),
        updateXrayObjectStatus({ ...firstFeature, id: "feature_a", screenId: "screen_a", name: "알람 확인" }, "accepted"),
      ],
      dataObjects: [
        updateXrayObjectStatus({ ...secondObject, id: "object_b", name: "Load", displayName: "부하" }, "accepted"),
        updateXrayObjectStatus({ ...firstObject, id: "object_a", name: "Alarm", displayName: "알람" }, "accepted"),
      ],
      dataFields: [
        updateXrayObjectStatus({ ...secondField, id: "field_b", dataObjectId: "object_b", name: "부하명" }, "accepted"),
        updateXrayObjectStatus({ ...firstField, id: "field_a", dataObjectId: "object_a", name: "알람명" }, "accepted"),
      ],
      issues: [
        updateXrayObjectStatus({ ...secondIssue, id: "issue_b", title: "부하 상태값 확정", severity: "medium" }, "accepted"),
        updateXrayObjectStatus({ ...firstIssue, id: "issue_a", title: "알람 기준 확정", severity: "low" }, "accepted"),
      ],
    },
  });
  const reorderedWorkspace = {
    ...stableWorkspace,
    objects: Object.fromEntries(
      Object.entries(stableWorkspace.objects).map(([bucket, objects]) => [bucket, [...objects].reverse()]),
    ),
  };

  const exportTypes = [
    "markdown",
    "appMermaid",
    "dataMermaid",
    "json",
    "dataObjectsCsv",
    "issuesCsv",
    "codexPrompt",
    "cursorPrompt",
    "githubIssues",
  ];

  for (const exportType of exportTypes) {
    const content = getExportContent(stableWorkspace, exportType);
    assert.equal(content, getExportContent(reorderedWorkspace, exportType), `${exportType} should use stable ordering`);
    assert.match(content, /대시보드|알람|부하/, `${exportType} should preserve Korean text`);
  }
});

test("csv exports use deterministic UTF-8 text headers and quote escaping", () => {
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(dataObject);
  assert.ok(issue);
  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [
        updateXrayObjectStatus(
          {
            ...dataObject,
            id: "object_csv",
            name: "Load",
            displayName: "부하, 설비",
            description: "현장 \"주요\" 설비",
          },
          "accepted",
        ),
      ],
      issues: [
        updateXrayObjectStatus(
          {
            ...issue,
            id: "issue_csv",
            title: "알람 기준",
            description: "상태값\n정의 필요",
            suggestion: "high, medium, low",
          },
          "accepted",
        ),
      ],
    },
  });

  assert.equal(
    exportDataObjectsCsv(workspace).split("\n")[0],
    "id,status,name,displayName,objectType,description,fieldCount,relationCount",
  );
  assert.match(exportDataObjectsCsv(workspace), /"부하, 설비"/);
  assert.match(exportDataObjectsCsv(workspace), /"현장 ""주요"" 설비"/);
  assert.equal(
    exportIssuesCsv(workspace).split("\n")[0],
    "id,status,severity,issueType,title,description,suggestion,resolutionNote,includeInPrompt,relatedScreenId,relatedDataObjectId,relatedFeatureId",
  );
  assert.match(exportIssuesCsv(workspace), /"상태값\n정의 필요"/);
  assert.match(exportIssuesCsv(workspace), /"high, medium, low"/);
});

test("all export types provide explicit empty-state content", () => {
  const workspace = confirmedWorkspace({
    project: { ...fieldPowerAppProject, name: "빈 내보내기 앱" },
    objects: emptySuggestionSetForTest(),
    buildPlanSuggestions: [],
  });
  const expectedEmptyPatterns = {
    markdown: /- None/,
    appMermaid: /%% No confirmed screens/,
    dataMermaid: /%% No confirmed data objects/,
    json: /"screens": \[\]/,
    dataObjectsCsv: /^id,status,name,displayName,objectType,description,fieldCount,relationCount$/,
    issuesCsv: /^id,status,severity,issueType,title,description,suggestion,resolutionNote,includeInPrompt,relatedScreenId,relatedDataObjectId,relatedFeatureId$/,
    codexPrompt: /- None/,
    cursorPrompt: /- None/,
    githubIssues: /- None/,
    bundle: /"files"/,
  };

  for (const [exportType, pattern] of Object.entries(expectedEmptyPatterns)) {
    assert.match(getExportContent(workspace, exportType, { generatedAt: "2026-07-01T00:00:00.000Z" }), pattern);
  }
});

test("workspace validation catches broken confirmed data relations", () => {
  const [source] = fieldPowerAppSuggestionSet.dataObjects;
  const [relation] = fieldPowerAppSuggestionSet.dataRelations;
  assert.ok(source);
  assert.ok(relation);

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [updateXrayObjectStatus(source, "accepted")],
      dataRelations: [
        updateXrayObjectStatus(
          {
            ...relation,
            sourceObjectId: source.id,
            targetObjectId: "missing_target",
          },
          "accepted",
        ),
      ],
    },
  });
  const report = validateWorkspace(workspace);

  assert.equal(report.isExportSafe, false);
  const issue = report.errors.find((candidate) => candidate.code === "broken_relation");
  assert.ok(issue);
  assert.equal(issue.targetBucket, "dataRelations");
  assert.equal(issue.targetId, relation.id);
  assert.equal(issue.relatedBucket, issue.targetBucket);
  assert.equal(issue.relatedObjectId, issue.targetId);
  assert.equal(issue.suggestedAction, "remove_broken_relation");
  assert.equal(getValidationRepairActionLabel(issue), "끊긴 연결 제외");
  assert.equal(getValidationReviewRoute(issue, workspace.project.id), "#/projects/project_field_power/review");
});

test("workspace validation catches duplicate confirmed names", () => {
  const [first, second] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(first);
  assert.ok(second);

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [
        updateXrayObjectStatus({ ...first, displayName: "설비" }, "accepted"),
        updateXrayObjectStatus({ ...second, displayName: "설비" }, "edited"),
      ],
    },
  });
  const report = validateWorkspace(workspace);

  assert.equal(report.isExportSafe, false);
  const issue = report.errors.find((candidate) => candidate.code === "duplicate_name");
  assert.ok(issue);
  assert.equal(issue.targetBucket, "dataObjects");
  assert.equal(issue.targetId, second.id);
  assert.equal(issue.suggestedAction, "mark_duplicate_deferred");
  assert.equal(getValidationRepairActionLabel(issue), "중복 항목 나중에 결정");
});

test("workspace validation gives each duplicate name issue a stable unique id", () => {
  const [first, second] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(first);
  assert.ok(second);
  const third = { ...second, id: "data_object_third_duplicate", name: "third_duplicate" };

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [
        updateXrayObjectStatus({ ...first, displayName: "설비" }, "accepted"),
        updateXrayObjectStatus({ ...second, displayName: "설비" }, "edited"),
        updateXrayObjectStatus({ ...third, displayName: "설비" }, "accepted"),
      ],
    },
  });
  const duplicateIssues = validateWorkspace(workspace).errors.filter((issue) => issue.code === "duplicate_name");

  assert.equal(duplicateIssues.length, 2);
  assert.deepEqual(new Set(duplicateIssues.map((issue) => issue.id)).size, duplicateIssues.length);
  assert.ok(duplicateIssues.some((issue) => issue.id.includes(second.id)));
  assert.ok(duplicateIssues.some((issue) => issue.id.includes(third.id)));
});

test("workspace validation catches confirmed fields without a confirmed data object", () => {
  const [field] = fieldPowerAppSuggestionSet.dataFields;
  assert.ok(field);

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataFields: [updateXrayObjectStatus({ ...field, dataObjectId: "missing_data_object" }, "accepted")],
    },
  });
  const report = validateWorkspace(workspace);

  assert.equal(report.isExportSafe, false);
  const issue = report.errors.find((candidate) => candidate.code === "orphan_field");
  assert.ok(issue);
  assert.equal(issue.targetBucket, "dataFields");
  assert.equal(issue.targetId, field.id);
  assert.equal(issue.suggestedAction, "review_target");
});

test("workspace validation catches empty confirmed object names", () => {
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(dataObject);

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [updateXrayObjectStatus({ ...dataObject, name: " ", displayName: " " }, "accepted")],
    },
  });
  const report = validateWorkspace(workspace);

  assert.equal(report.isExportSafe, false);
  const issue = report.errors.find((candidate) => candidate.code === "empty_object_name");
  assert.ok(issue);
  assert.equal(issue.targetBucket, "dataObjects");
  assert.equal(issue.targetId, dataObject.id);
  assert.equal(issue.suggestedAction, "review_target");
});

test("workspace validation catches non-confirmed export contamination references", () => {
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  const [field] = fieldPowerAppSuggestionSet.dataFields;
  assert.ok(dataObject);
  assert.ok(field);

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [{ ...dataObject, status: "suggested" }],
      dataFields: [updateXrayObjectStatus({ ...field, dataObjectId: dataObject.id }, "accepted")],
    },
  });
  const report = validateWorkspace(workspace);

  assert.equal(report.isExportSafe, false);
  const issue = report.errors.find((candidate) => candidate.code === "non_confirmed_export");
  assert.ok(issue);
  assert.equal(issue.targetBucket, "dataFields");
  assert.equal(issue.targetId, field.id);
  assert.equal(issue.suggestedAction, "review_target");
});

test("workspace validation warns when confirmed data object has no confirmed fields", () => {
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(dataObject);

  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [updateXrayObjectStatus(dataObject, "accepted")],
      dataFields: [],
    },
  });
  const report = validateWorkspace(workspace);

  assert.equal(report.isExportSafe, true);
  assert.ok(report.warnings.some((issue) => issue.code === "data_object_without_fields"));
});

test("workspace validation ignores suggested-only objects as export errors", () => {
  const workspace = {
    project: fieldPowerAppProject,
    sourceDocuments: [fieldPowerAppSourceDocument],
    objects: fieldPowerAppSuggestionSet,
    buildPlanSuggestions: [],
    updatedAt: "2026-06-23T01:00:00.000Z",
  };
  const report = validateWorkspace(workspace);

  assert.equal(report.errors.length, 0);
});

test("structure diff reports added changed status changes and preserved confirmed objects", () => {
  const [screenA, screenB, screenC] = fieldPowerAppSuggestionSet.screens;
  assert.ok(screenA);
  assert.ok(screenB);
  assert.ok(screenC);
  const accepted = updateXrayObjectStatus(screenA, "accepted", "2026-06-23T01:00:00.000Z");
  const suggested = updateXrayObjectStatus(screenB, "suggested", "2026-06-23T01:00:00.000Z");
  const statusBefore = updateXrayObjectStatus(screenC, "suggested", "2026-06-23T01:00:00.000Z");

  const before = {
    ...emptySuggestionSetForTest(),
    screens: [accepted, suggested, statusBefore],
  };
  const after = {
    ...emptySuggestionSetForTest(),
    screens: [
      accepted,
      { ...suggested, description: "AI가 갱신한 설명" },
      updateXrayObjectStatus(statusBefore, "accepted", "2026-06-23T02:00:00.000Z"),
      { ...fieldPowerAppSuggestionSet.screens[3], id: "screen_added" },
    ],
  };
  const diff = compareSuggestionSets(before, after);

  assert.equal(diff.counts.preserved_confirmed, 1);
  assert.equal(diff.counts.changed, 1);
  assert.equal(diff.counts.status_changed, 1);
  assert.equal(diff.counts.added, 1);
});

test("GitHub issue markdown includes confirmed issues only", () => {
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(issue);
  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      issues: [
        updateXrayObjectStatus({ ...issue, title: "확정된 결정 필요 항목" }, "accepted"),
        updateXrayObjectStatus({ ...issue, id: "issue_rejected", title: "제외된 항목" }, "rejected"),
        { ...issue, id: "issue_suggested", title: "검토 대기 항목", status: "suggested" },
      ],
    },
  });
  const markdown = exportGithubIssuesMarkdown(workspace);

  assert.match(markdown, /확정된 결정 필요 항목/);
  assert.doesNotMatch(markdown, /제외된 항목/);
  assert.doesNotMatch(markdown, /검토 대기 항목/);
  assert.match(markdown, /### Acceptance Criteria/);
});

test("export helpers support GitHub issue markdown", () => {
  const workspace = confirmedWorkspace({
    project: { ...fieldPowerAppProject, name: "현장 전력설비 관리 앱!" },
  });

  assert.equal(getExportFileName(workspace, "githubIssues"), "app-xray-현장-전력설비-관리-앱-github-issues.md");
  assert.equal(getExportContent(workspace, "githubIssues"), exportGithubIssuesMarkdown(workspace));
});

test("build prompt includes validation warnings but excludes rejected issues", () => {
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(dataObject);
  assert.ok(issue);
  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [updateXrayObjectStatus(dataObject, "accepted")],
      issues: [updateXrayObjectStatus(issue, "rejected")],
    },
  });
  const prompt = createBuildPrompt(workspace, { targetTool: "codex" });

  assert.match(prompt, /Export validation warnings/);
  assert.match(prompt, /확정된 필드가 없습니다/);
  assert.doesNotMatch(prompt, /알람 발생 조건이 빠져 있음/);
});

test("source import classifies markdown txt and rejects pdf for now", () => {
  assert.deepEqual(classifySourceFile("idea.md", "# PRD").sourceType, "markdown");
  assert.deepEqual(classifySourceFile("idea.txt", "PRD").sourceType, "txt");
  assert.equal(classifySourceFile("idea.pdf", "").ok, false);
});

test("source import classifies csv json and pasted text", () => {
  const csv = classifySourceFile("contacts.csv", "name,email\n홍길동,hong@example.com");
  const json = classifySourceFile("workflow.json", "{\"screen\":\"대시보드\",\"enabled\":true}");
  const pasted = classifyPastedSource("직접 입력한 앱 아이디어");

  assert.equal(csv.ok, true);
  assert.equal(csv.sourceType, "csv");
  assert.match(csv.content, /CSV headers: name, email/);
  assert.match(csv.content, /홍길동,hong@example.com/);

  assert.equal(json.ok, true);
  assert.equal(json.sourceType, "json");
  assert.match(json.content, /"screen": "대시보드"/);
  assert.match(json.content, /"enabled": true/);

  assert.equal(pasted.ok, true);
  assert.equal(pasted.sourceType, "text");
  assert.equal(pasted.content, "직접 입력한 앱 아이디어");
});

test("source import reports malformed json and unsupported binary files in Korean", () => {
  const malformedJson = classifySourceFile("broken.json", "{\"screen\":");
  const binary = classifySourceFile("image.png", "\u0000PNG");
  const noExtensionFile = classifySourceFile("README", "원문처럼 보여도 파일 import에서는 확장자가 필요합니다.");

  assert.equal(malformedJson.ok, false);
  assert.match(malformedJson.error, /JSON 형식을 읽을 수 없습니다/);
  assert.equal(binary.ok, false);
  assert.match(binary.error, /지원하지 않는 파일 형식입니다/);
  assert.equal(noExtensionFile.ok, false);
  assert.match(noExtensionFile.error, /지원하지 않는 파일 형식입니다/);
});

test("source import rejects empty csv and documents simple header parsing", () => {
  const emptyCsv = classifySourceFile("empty.csv", "  \n ");
  const quotedCsv = classifySourceFile("quoted.csv", "\uFEFF\"name, full\",\"note\"\n\"홍, 길동\",\"설명\"");

  assert.equal(emptyCsv.ok, false);
  assert.match(emptyCsv.error, /CSV 파일이 비어 있습니다/);
  assert.equal(quotedCsv.ok, true);
  assert.match(quotedCsv.content, /CSV headers: name, full, note/);
});

test("source document versions preserve imported source type", () => {
  const next = appendSourceDocumentVersion(confirmedWorkspace(), "# Markdown PRD", {
    id: "src_markdown",
    createdAt: "2026-06-23T04:00:00.000Z",
    sourceType: "markdown",
  });

  assert.equal(getLatestSourceDocument(next)?.sourceType, "markdown");
});

test("source document versions skip exact duplicate latest content", () => {
  const workspace = confirmedWorkspace();
  const next = appendSourceDocumentVersion(workspace, fieldPowerAppSourceDocument.content, {
    id: "src_duplicate_import",
    createdAt: "2026-07-01T04:00:00.000Z",
    sourceType: "text",
  });

  assert.equal(next.sourceDocuments.length, workspace.sourceDocuments.length);
  assert.equal(getLatestSourceDocument(next)?.id, getLatestSourceDocument(workspace)?.id);
});

test("source document versions allow reverting to older content as the latest source", () => {
  const workspace = confirmedWorkspace();
  const withSecondVersion = appendSourceDocumentVersion(workspace, "다른 원문", {
    id: "src_second",
    createdAt: "2026-07-01T03:00:00.000Z",
    sourceType: "text",
  });
  const reverted = appendSourceDocumentVersion(withSecondVersion, fieldPowerAppSourceDocument.content, {
    id: "src_reverted",
    createdAt: "2026-07-01T04:00:00.000Z",
    sourceType: "text",
  });

  assert.equal(reverted.sourceDocuments.length, withSecondVersion.sourceDocuments.length + 1);
  assert.equal(getLatestSourceDocument(reverted)?.id, "src_reverted");
  assert.equal(getLatestSourceDocument(reverted)?.content, fieldPowerAppSourceDocument.content);
});

test("source document versions preserve exact whitespace changes", () => {
  const workspace = confirmedWorkspace();
  const next = appendSourceDocumentVersion(workspace, ` ${fieldPowerAppSourceDocument.content} `, {
    id: "src_whitespace_variant",
    createdAt: "2026-07-01T04:30:00.000Z",
    sourceType: "text",
  });

  assert.equal(next.sourceDocuments.length, workspace.sourceDocuments.length + 1);
  assert.equal(getLatestSourceDocument(next)?.content, ` ${fieldPowerAppSourceDocument.content} `);
});

test("template validation catches broken references", () => {
  const broken = {
    ...fieldPowerTemplate,
    dataRelations: [{ ...fieldPowerTemplate.dataRelations[0], targetObjectId: "missing" }],
  };
  const report = validateTemplateManifest(broken);

  assert.equal(report.isValid, false);
  assert.ok(report.errors.some((issue) => issue.code === "broken_template_relation"));
});

test("template apply imports suggested objects and preserves confirmed structures", () => {
  const workspace = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      dataObjects: [updateXrayObjectStatus(fieldPowerAppSuggestionSet.dataObjects[0], "accepted")],
    },
  });
  const result = applyTemplateToWorkspace(workspace, fieldPowerTemplate, "2026-06-23T05:00:00.000Z");

  assert.equal(result.validation.isValid, true);
  assert.equal(result.workspace.appliedTemplates[0].templateId, fieldPowerTemplate.templateId);
  assert.equal(result.workspace.objects.dataObjects[0].status, "accepted");
  assert.ok(result.workspace.objects.screens.every((screen) => screen.status === "suggested"));
  assert.ok(result.workspace.objects.screens.every((screen) => screen.origin?.kind === "template"));
});

test("prompt target supports Codex Cursor Lovable Replit and Bolt", () => {
  const workspace = confirmedWorkspace();

  for (const targetTool of ["codex", "cursor", "lovable", "replit", "bolt"]) {
    const prompt = createBuildPrompt(workspace, { targetTool });
    assert.match(prompt, new RegExp(targetTool === "codex" ? "Codex" : targetTool[0].toUpperCase() + targetTool.slice(1)));
    assert.doesNotMatch(prompt, /제외된 항목/);
  }
});

test("audit export mode includes suggested and rejected records only when requested", () => {
  const [screen] = fieldPowerAppSuggestionSet.screens;
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(screen);
  assert.ok(dataObject);
  const workspace = {
    ...confirmedWorkspace(),
    objects: {
      ...emptySuggestionSetForTest(),
      screens: [
        updateXrayObjectStatus({ ...screen, id: "screen_confirmed", displayName: "확정 화면" }, "accepted"),
        { ...screen, id: "screen_suggested", displayName: "검토 화면", status: "suggested" },
        updateXrayObjectStatus({ ...screen, id: "screen_rejected", displayName: "제외 화면" }, "rejected"),
      ],
      dataObjects: [
        { ...dataObject, id: "object_suggested", name: "SuggestedObject", status: "suggested" },
        updateXrayObjectStatus({ ...dataObject, id: "object_rejected", name: "RejectedObject" }, "rejected"),
      ],
    },
  };

  assert.doesNotMatch(getExportContent(workspace, "markdown"), /검토 화면/);
  assert.match(getExportContent(workspace, "markdown", { mode: "auditTrail" }), /검토 화면/);
  assert.match(getExportContent(workspace, "json", { mode: "auditTrail", includeValidationAppendix: true }), /"validation"/);
  assert.doesNotMatch(getExportContent(workspace, "appMermaid"), /검토 화면/);
  assert.match(getExportContent(workspace, "appMermaid", { mode: "auditTrail" }), /Audit trail export/);
  assert.match(getExportContent(workspace, "appMermaid", { mode: "auditTrail" }), /검토 화면 \[suggested\]/);
  assert.match(getExportContent(workspace, "appMermaid", { mode: "auditTrail" }), /제외 화면 \[rejected\]/);
  assert.match(getExportContent(workspace, "dataMermaid", { mode: "auditTrail" }), /Audit trail export/);
  assert.match(getExportContent(workspace, "dataMermaid", { mode: "auditTrail" }), /review_status "suggested"/);
  assert.match(getExportContent(workspace, "dataMermaid", { mode: "auditTrail" }), /review_status "rejected"/);
});

test("AI provider settings persist locally without exposing API key publicly", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  saveAiProviderConfig(
    {
      provider: "openai",
      modelName: "gpt-test",
      apiKey: "secret-value",
      apiKeyPresent: true,
    },
    adapter,
  );

  const loaded = loadAiProviderConfig(adapter);
  assert.equal(loaded.apiKey, "secret-value");
  assert.equal(toPublicAiProviderConfig(loaded).apiKey, undefined);
  assert.equal(toPublicAiProviderConfig(loaded).apiKeyPresent, true);
});

test("hash routes parse project sections and settings", () => {
  assert.deepEqual(parseAppRoute("#/projects"), { name: "projects" });
  assert.deepEqual(parseAppRoute("#/settings/ai"), { name: "aiSettings" });
  assert.deepEqual(parseAppRoute(projectRoute("project_1", "review")), {
    name: "projectSection",
    projectId: "project_1",
    section: "review",
  });
});

test("project route helper keeps valid project routes after deletion fallback", () => {
  assert.equal(projectRoute("project_a", "review"), "#/projects/project_a/review");
  assert.equal(projectRoute("project_b", "source"), "#/projects/project_b/source");
});

test("workspace backup import rejects malformed input and preserves confirmed objects", () => {
  assert.equal(importWorkspaceBackup("{bad-json", null).ok, false);

  const current = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      screens: [updateXrayObjectStatus(fieldPowerAppSuggestionSet.screens[0], "accepted")],
    },
  });
  const imported = confirmedWorkspace({
    objects: {
      ...emptySuggestionSetForTest(),
      screens: [{ ...fieldPowerAppSuggestionSet.screens[0], displayName: "import tried overwrite", status: "suggested" }],
    },
  });
  const result = importWorkspaceBackup(serializeWorkspaceBackup(imported), current);

  assert.equal(result.ok, true);
  assert.equal(result.workspace.objects.screens[0].displayName, current.objects.screens[0].displayName);
});

test("localStorage repository saves reloads and clears a workspace", () => {
  const storage = new Map();
  const repository = createLocalStorageProjectRepository({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  });
  const workspace = {
    project: fieldPowerAppProject,
    sourceDocuments: [fieldPowerAppSourceDocument],
    objects: fieldPowerAppSuggestionSet,
    buildPlanSuggestions: [],
    updatedAt: "2026-06-23T01:00:00.000Z",
  };

  repository.save(workspace);
  assert.deepEqual(repository.load()?.project, fieldPowerAppProject);
  repository.clear();
  assert.equal(repository.load(), null);
});

test("localStorage repository stores switches and deletes multiple local projects", () => {
  const storage = new Map();
  const repository = createLocalStorageProjectRepository({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  });
  const first = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_first", name: "첫 프로젝트" },
    updatedAt: "2026-06-23T01:00:00.000Z",
  });
  const second = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_second", name: "둘 프로젝트" },
    updatedAt: "2026-06-23T02:00:00.000Z",
  });

  repository.saveWorkspace(first);
  repository.saveWorkspace(second);
  assert.equal(repository.load()?.project.id, "project_second");
  assert.deepEqual(summarizeProjects(repository.loadCollectionWithStatus().collection).map((project) => project.id), [
    "project_second",
    "project_first",
  ]);

  assert.equal(repository.setActiveProject("project_first").workspace.project.name, "첫 프로젝트");
  const afterDelete = repository.deleteWorkspace("project_first");
  assert.equal(afterDelete.activeWorkspace.project.id, "project_second");
  assert.equal(afterDelete.collection.workspaces.length, 1);
});

test("project workspace factory uses user-provided name and source text", () => {
  const workspace = createProjectWorkspace({
    name: "고객 상담 앱",
    sourceText: "상담 접수와 처리 이력을 관리한다.",
    sourceType: "text",
    now: "2026-07-01T00:00:00.000Z",
    projectId: "project_user_input",
    sourceDocumentId: "src_user_input",
  });

  assert.equal(workspace.project.name, "고객 상담 앱");
  assert.equal(workspace.project.id, "project_user_input");
  assert.equal(workspace.sourceDocuments[0].content, "상담 접수와 처리 이력을 관리한다.");
  assert.equal(workspace.sourceDocuments[0].projectId, "project_user_input");
  assert.deepEqual(workspace.objects, emptySuggestionSetForTest());
});

test("localStorage repository returns an empty collection when nothing is stored", () => {
  const result = loadProjectCollection({ getItem: () => null });

  assert.equal(result.activeWorkspace, null);
  assert.equal(result.collection.workspaces.length, 0);
  assert.equal(result.collection.activeProjectId, undefined);
  assert.equal(result.error, undefined);
});

test("localStorage repository opens corrupt collections as a recovery state", () => {
  const result = loadProjectCollection({
    getItem: (key) => (key === "app-xray.projects.v1" ? "{broken-json" : null),
  });

  assert.equal(result.activeWorkspace, null);
  assert.equal(result.collection.workspaces.length, 0);
  assert.match(result.error, /프로젝트 목록을 읽을 수 없어/);
});

test("localStorage repository rejects duplicate project names without overwriting data", () => {
  const storage = new Map();
  const repository = createLocalStorageProjectRepository({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  });
  const first = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_first", name: "중복 이름" },
  });
  const second = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_second", name: "중복 이름" },
  });

  repository.saveWorkspace(first);
  const result = repository.saveWorkspace(second);

  assert.match(result.error, /같은 이름/);
  assert.equal(result.collection.workspaces.length, 1);
  assert.equal(result.collection.workspaces[0].project.id, "project_first");
  assert.equal(repository.load()?.project.id, "project_first");
});

test("localStorage repository deletes only the requested project and keeps a valid active project", () => {
  const storage = new Map();
  const repository = createLocalStorageProjectRepository({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  });
  const first = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_first", name: "첫 프로젝트" },
    updatedAt: "2026-07-01T01:00:00.000Z",
  });
  const second = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_second", name: "둘 프로젝트" },
    updatedAt: "2026-07-01T02:00:00.000Z",
  });
  const third = confirmedWorkspace({
    project: { ...fieldPowerAppProject, id: "project_third", name: "셋 프로젝트" },
    updatedAt: "2026-07-01T03:00:00.000Z",
  });

  repository.saveWorkspace(first);
  repository.saveWorkspace(second);
  repository.saveWorkspace(third);
  repository.setActiveProject("project_second");
  const afterDelete = repository.deleteWorkspace("project_second");

  assert.deepEqual(
    afterDelete.collection.workspaces.map((item) => item.project.id).sort(),
    ["project_first", "project_third"],
  );
  assert.notEqual(afterDelete.collection.activeProjectId, "project_second");
  assert.ok(afterDelete.activeWorkspace);
  assert.equal(afterDelete.activeWorkspace.project.id, afterDelete.collection.activeProjectId);
});

test("localStorage collection loader migrates a legacy single workspace", () => {
  const workspace = confirmedWorkspace();
  const result = loadProjectCollection({
    getItem: (key) => (key === "app-xray.workspace.v1" ? JSON.stringify(workspace) : null),
  });

  assert.equal(result.activeWorkspace.project.id, fieldPowerAppProject.id);
  assert.equal(result.collection.workspaces.length, 1);
});

test("localStorage parse failure opens empty with a visible load error", () => {
  const result = loadProjectWorkspace({
    getItem: () => "{not-json",
  });

  assert.equal(result.workspace, null);
  assert.match(result.error, /읽을 수 없어 빈 상태/);
});

test("source document versions increment without replacing previous source text", () => {
  const workspace = confirmedWorkspace();
  const next = appendSourceDocumentVersion(workspace, "새로운 PRD 원문", {
    id: "src_v2",
    createdAt: "2026-06-23T02:00:00.000Z",
  });

  assert.equal(workspace.sourceDocuments.length, 1);
  assert.equal(next.sourceDocuments.length, 2);
  assert.equal(getLatestSourceDocument(next)?.version, 2);
  assert.equal(getLatestSourceDocument(next)?.content, "새로운 PRD 원문");
  assert.equal(next.sourceDocuments[0].content, fieldPowerAppSourceDocument.content);
});

test("source document version is not duplicated when content is unchanged", () => {
  const workspace = confirmedWorkspace();
  const next = appendSourceDocumentVersion(workspace, fieldPowerAppSourceDocument.content, {
    id: "src_duplicate",
    createdAt: "2026-06-23T02:00:00.000Z",
  });

  assert.equal(next, workspace);
  assert.equal(next.sourceDocuments.length, 1);
});

test("source document factory creates the expected next version", () => {
  const sourceDocument = createSourceDocumentVersion({
    project: fieldPowerAppProject,
    content: "PRD v3",
    createdAt: "2026-06-23T03:00:00.000Z",
    id: "src_v3",
    previousVersion: 2,
  });

  assert.equal(sourceDocument.id, "src_v3");
  assert.equal(sourceDocument.version, 3);
  assert.equal(sourceDocument.content, "PRD v3");
});

test("merge impact distinguishes added refreshed and preserved reviewed suggestions", () => {
  const [screenA, screenB] = fieldPowerAppSuggestionSet.screens;
  const [dataObjectA, dataObjectB] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(screenA);
  assert.ok(screenB);
  assert.ok(dataObjectA);
  assert.ok(dataObjectB);

  const existing = {
    ...emptySuggestionSetForTest(),
    screens: [updateXrayObjectStatus(screenA, "accepted"), screenB],
    dataObjects: [updateXrayObjectStatus(dataObjectB, "rejected")],
  };
  const incoming = {
    ...emptySuggestionSetForTest(),
    screens: [{ ...screenA, displayName: "AI가 바꾼 이름" }, { ...screenB, displayName: "갱신된 제안" }],
    dataObjects: [dataObjectA, { ...dataObjectB, displayName: "AI가 다시 제안한 제외 항목" }],
  };

  const impact = summarizeSuggestionMergeImpact(existing, incoming);
  assert.equal(impact.preservedConfirmedCount, 1);
  assert.equal(impact.preservedReviewDecisionCount, 1);
  assert.equal(impact.refreshedSuggestedCount, 1);
  assert.equal(impact.addedSuggestedCount, 1);
  assert.deepEqual(
    impact.changes.map((change) => change.changeType).sort(),
    ["added_suggestion", "preserved_confirmed", "preserved_review_decision", "refreshed_suggestion"],
  );
});

test("AI analysis validation accepts canonical mock and rejects unsafe shapes", () => {
  assert.equal(validateAiAnalysisResult(mockAnalysisClone()).ok, true);

  const invalidConfidence = mockAnalysisClone();
  invalidConfidence.screens[0].confidence = 2;
  assert.deepEqual(validateAiAnalysisResult(invalidConfidence).ok, false);

  const invalidRelation = mockAnalysisClone();
  invalidRelation.dataRelations[0].targetObjectTempId = "missing_object";
  assert.match(validateAiAnalysisResult(invalidRelation).errors.join(" "), /존재하지 않는 tempId/);

  const duplicate = mockAnalysisClone();
  duplicate.screens[1].tempId = duplicate.screens[0].tempId;
  assert.match(validateAiAnalysisResult(duplicate).errors.join(" "), /중복 tempId/);
});

function mockAnalysisClone() {
  return JSON.parse(JSON.stringify(mockFieldPowerAppAnalysis));
}

function emptySuggestionSetForTest() {
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

function confirmedWorkspace(overrides = {}) {
  return {
    project: fieldPowerAppProject,
    sourceDocuments: [fieldPowerAppSourceDocument],
    objects: {
      requirements: fieldPowerAppSuggestionSet.requirements.map((object) => updateXrayObjectStatus(object, "accepted")),
      screens: fieldPowerAppSuggestionSet.screens.map((object) => updateXrayObjectStatus(object, "accepted")),
      features: fieldPowerAppSuggestionSet.features.map((object) => updateXrayObjectStatus(object, "accepted")),
      dataObjects: fieldPowerAppSuggestionSet.dataObjects.map((object) => updateXrayObjectStatus(object, "accepted")),
      dataFields: fieldPowerAppSuggestionSet.dataFields.map((object) => updateXrayObjectStatus(object, "accepted")),
      dataRelations: fieldPowerAppSuggestionSet.dataRelations.map((object) => updateXrayObjectStatus(object, "accepted")),
      roles: fieldPowerAppSuggestionSet.roles.map((object) => updateXrayObjectStatus(object, "accepted")),
      permissions: fieldPowerAppSuggestionSet.permissions.map((object) => updateXrayObjectStatus(object, "accepted")),
      flows: fieldPowerAppSuggestionSet.flows.map((object) => updateXrayObjectStatus(object, "accepted")),
      flowSteps: fieldPowerAppSuggestionSet.flowSteps.map((object) => updateXrayObjectStatus(object, "accepted")),
      issues: fieldPowerAppSuggestionSet.issues.map((object) => updateXrayObjectStatus(object, "accepted")),
    },
    buildPlanSuggestions: [],
    updatedAt: "2026-06-23T01:00:00.000Z",
    ...overrides,
  };
}
