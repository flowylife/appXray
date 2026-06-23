import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAiAnalysisResult } from "../dist/ai/adapter.js";
import { compareSuggestionSets } from "../dist/domain/diff.js";
import { fieldPowerAppSuggestionSet, mockFieldPowerAppAnalysis } from "../dist/fixtures/field-power-app.js";
import {
  updateXrayObjectStatus,
  editXrayObject,
  mergeAiSuggestionsPreservingConfirmed,
  summarizeSuggestionMergeImpact,
} from "../dist/domain/lifecycle.js";
import {
  appendSourceDocumentVersion,
  createSourceDocumentVersion,
  getLatestSourceDocument,
} from "../dist/domain/source-documents.js";
import {
  getDefaultExportableObjects,
  isConfirmedStatus,
  isConfirmedXrayObject,
} from "../dist/domain/status.js";
import { validateWorkspace } from "../dist/domain/validation.js";
import { fieldPowerAppProject, fieldPowerAppSourceDocument } from "../dist/fixtures/field-power-app.js";
import { exportGithubIssuesMarkdown } from "../dist/export/github-issues.js";
import { exportProjectJson } from "../dist/export/json.js";
import { exportProjectMarkdown } from "../dist/export/markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "../dist/export/mermaid.js";
import { getExportContent, getExportFileName } from "../dist/export/export-content.js";
import { createBuildPrompt } from "../dist/prompt/build-prompt.js";
import {
  createLocalStorageProjectRepository,
  loadProjectCollection,
  loadProjectWorkspace,
  summarizeProjects,
} from "../dist/storage/project-repository.js";

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

test("AI rerun merge does not overwrite accepted or edited structures", () => {
  const [screen] = fieldPowerAppSuggestionSet.screens;
  assert.ok(screen);

  const accepted = updateXrayObjectStatus(screen, "accepted", "2026-06-23T01:00:00.000Z");
  const editedIncoming = { ...screen, displayName: "AI rerun changed this", status: "suggested" };
  const merged = mergeAiSuggestionsPreservingConfirmed(
    { ...fieldPowerAppSuggestionSet, screens: [accepted] },
    { ...fieldPowerAppSuggestionSet, screens: [editedIncoming] },
  );

  assert.equal(merged.screens.length, 1);
  assert.equal(merged.screens[0].status, "accepted");
  assert.equal(merged.screens[0].displayName, accepted.displayName);
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
  assert.equal(getExportContent(workspace, "markdown"), exportProjectMarkdown(workspace));
  assert.equal(getExportContent(workspace, "json"), exportProjectJson(workspace));
  assert.equal(getExportContent(workspace, "codexPrompt"), createBuildPrompt(workspace, { targetTool: "codex" }));
});

test("export bundle contains deterministic confirmed-only files", () => {
  const workspace = confirmedWorkspace();
  const bundle = JSON.parse(getExportContent(workspace, "bundle"));

  assert.equal(bundle.projectId, workspace.project.id);
  assert.deepEqual(
    bundle.files.map((file) => file.exportType),
    ["markdown", "appMermaid", "dataMermaid", "json", "codexPrompt", "cursorPrompt", "githubIssues"],
  );
  assert.equal(getExportContent(workspace, "bundle"), getExportContent(workspace, "bundle"));
  assert.match(bundle.files.find((file) => file.exportType === "json").content, /"objects"/);
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
  assert.ok(report.errors.some((issue) => issue.code === "broken_relation"));
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
  assert.ok(report.errors.some((issue) => issue.code === "duplicate_name"));
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

test("merge impact distinguishes added refreshed and preserved confirmed suggestions", () => {
  const [screenA, screenB] = fieldPowerAppSuggestionSet.screens;
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  assert.ok(screenA);
  assert.ok(screenB);
  assert.ok(dataObject);

  const existing = {
    ...emptySuggestionSetForTest(),
    screens: [updateXrayObjectStatus(screenA, "accepted"), screenB],
    dataObjects: [],
  };
  const incoming = {
    ...emptySuggestionSetForTest(),
    screens: [{ ...screenA, displayName: "AI가 바꾼 이름" }, { ...screenB, displayName: "갱신된 제안" }],
    dataObjects: [dataObject],
  };

  const impact = summarizeSuggestionMergeImpact(existing, incoming);
  assert.equal(impact.preservedConfirmedCount, 1);
  assert.equal(impact.refreshedSuggestedCount, 1);
  assert.equal(impact.addedSuggestedCount, 1);
  assert.deepEqual(
    impact.changes.map((change) => change.changeType).sort(),
    ["added_suggestion", "preserved_confirmed", "refreshed_suggestion"],
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
