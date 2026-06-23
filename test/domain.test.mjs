import assert from "node:assert/strict";
import { test } from "node:test";

import { fieldPowerAppSuggestionSet } from "../dist/fixtures/field-power-app.js";
import { updateXrayObjectStatus, editXrayObject, mergeAiSuggestionsPreservingConfirmed } from "../dist/domain/lifecycle.js";
import {
  getDefaultExportableObjects,
  isConfirmedStatus,
  isConfirmedXrayObject,
} from "../dist/domain/status.js";
import { fieldPowerAppProject, fieldPowerAppSourceDocument } from "../dist/fixtures/field-power-app.js";
import { exportProjectJson } from "../dist/export/json.js";
import { exportProjectMarkdown } from "../dist/export/markdown.js";
import { exportAppMapMermaid, exportDataMapMermaid } from "../dist/export/mermaid.js";
import { createBuildPrompt } from "../dist/prompt/build-prompt.js";
import { createLocalStorageProjectRepository } from "../dist/storage/project-repository.js";

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
