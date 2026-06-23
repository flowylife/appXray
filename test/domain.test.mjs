import assert from "node:assert/strict";
import { test } from "node:test";

import { fieldPowerAppSuggestionSet } from "../dist/fixtures/field-power-app.js";
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
import { fieldPowerAppProject, fieldPowerAppSourceDocument } from "../dist/fixtures/field-power-app.js";
import { exportProjectJson } from "../dist/export/json.js";
import { exportProjectMarkdown } from "../dist/export/markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "../dist/export/mermaid.js";
import { getExportContent, getExportFileName } from "../dist/export/export-content.js";
import { createBuildPrompt } from "../dist/prompt/build-prompt.js";
import { createLocalStorageProjectRepository, loadProjectWorkspace } from "../dist/storage/project-repository.js";

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
    },
    "2026-06-23T01:00:00.000Z",
  );

  assert.equal(edited.status, "edited");
  assert.equal(edited.title, "수정된 결정 필요 항목");
  assert.equal(edited.description, "사용자가 설명을 명확히 고쳤습니다.");
  assert.equal(edited.suggestion, "상태 값을 먼저 확정하세요.");
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
  assert.equal(getExportContent(workspace, "markdown"), exportProjectMarkdown(workspace));
  assert.equal(getExportContent(workspace, "json"), exportProjectJson(workspace));
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
});

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
