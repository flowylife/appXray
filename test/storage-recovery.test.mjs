import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";

import {
  createAutosaveSnapshot,
  listAutosaveSnapshots,
  pruneAutosaveSnapshots,
  restoreAutosaveSnapshot,
} from "../dist/storage/autosave-snapshots.js";
import { fieldPowerAppProject, fieldPowerAppSourceDocument, fieldPowerAppSuggestionSet } from "../dist/fixtures/field-power-app.js";

test("autosave snapshots create and list per project with validation status", () => {
  const storage = memoryStorage();
  const workspace = workspaceForTest("project_alpha", "알파 프로젝트", "2026-07-01T01:00:00.000Z");

  const snapshot = createAutosaveSnapshot(storage, workspace, {
    createdAt: "2026-07-01T01:01:00.000Z",
    snapshotId: "snapshot_alpha_1",
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.snapshot.id, "snapshot_alpha_1");
  assert.equal(snapshot.snapshot.projectId, "project_alpha");
  assert.equal(snapshot.snapshot.projectName, "알파 프로젝트");
  assert.equal(snapshot.snapshot.validation.isExportSafe, true);

  const listed = listAutosaveSnapshots(storage, "project_alpha");
  assert.deepEqual(listed.map((item) => item.id), ["snapshot_alpha_1"]);
  assert.equal(listed[0].projectName, "알파 프로젝트");
  assert.equal(listed[0].validation.isExportSafe, true);
  assert.deepEqual(listAutosaveSnapshots(storage, "project_beta"), []);
});

test("autosave snapshots restore a selected workspace without mutating storage", () => {
  const storage = memoryStorage();
  const workspace = workspaceForTest("project_restore", "복원 대상", "2026-07-01T01:00:00.000Z");
  createAutosaveSnapshot(storage, workspace, {
    createdAt: "2026-07-01T01:01:00.000Z",
    snapshotId: "snapshot_restore_1",
  });

  const restored = restoreAutosaveSnapshot(storage, "snapshot_restore_1");

  assert.equal(restored.ok, true);
  assert.equal(restored.workspace.project.name, "복원 대상");
  assert.equal(listAutosaveSnapshots(storage, "project_restore").length, 1);
});

test("autosave snapshot retention is bounded and deterministic", () => {
  const storage = memoryStorage();
  for (let index = 1; index <= 4; index += 1) {
    createAutosaveSnapshot(storage, workspaceForTest("project_bounded", "보관 제한", `2026-07-01T01:0${index}:00.000Z`), {
      createdAt: `2026-07-01T01:0${index}:00.000Z`,
      snapshotId: `snapshot_${index}`,
      maxSnapshotsPerProject: 3,
    });
  }

  assert.deepEqual(
    listAutosaveSnapshots(storage, "project_bounded").map((item) => item.id),
    ["snapshot_4", "snapshot_3", "snapshot_2"],
  );

  const pruned = pruneAutosaveSnapshots(storage, "project_bounded", 2);
  assert.deepEqual(pruned.removedSnapshotIds, ["snapshot_2"]);
  assert.deepEqual(
    listAutosaveSnapshots(storage, "project_bounded").map((item) => item.id),
    ["snapshot_4", "snapshot_3"],
  );
});

test("autosave snapshot restore reports missing and corrupt stored snapshots", () => {
  const storage = memoryStorage();
  assert.deepEqual(restoreAutosaveSnapshot(storage, "missing_snapshot"), {
    ok: false,
    error: "선택한 자동 저장 기록을 찾을 수 없습니다.",
  });

  storage.setItem("app-xray.autosave-snapshots.v1", "{bad-json");
  assert.deepEqual(createAutosaveSnapshot(storage, workspaceForTest("project_corrupt", "깨진 저장소", "2026-07-01T01:00:00.000Z")), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });
  assert.equal(storage.getItem("app-xray.autosave-snapshots.v1"), "{bad-json");
  assert.deepEqual(restoreAutosaveSnapshot(storage, "snapshot_1"), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });

  storage.setItem("app-xray.autosave-snapshots.v1", JSON.stringify({ snapshots: [] }));
  assert.deepEqual(createAutosaveSnapshot(storage, workspaceForTest("project_corrupt", "깨진 저장소", "2026-07-01T01:00:00.000Z")), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });
  assert.equal(storage.getItem("app-xray.autosave-snapshots.v1"), JSON.stringify({ snapshots: [] }));

  const malformedSnapshot = {
    id: "snapshot_malformed",
    projectId: "project_corrupt",
    projectName: "깨진 저장소",
    createdAt: "2026-07-01T01:00:00.000Z",
    workspace: {},
    validation: { errors: [], warnings: [], isExportSafe: true },
  };
  storage.setItem("app-xray.autosave-snapshots.v1", JSON.stringify([malformedSnapshot]));
  assert.deepEqual(restoreAutosaveSnapshot(storage, "snapshot_malformed"), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });
  assert.deepEqual(createAutosaveSnapshot(storage, workspaceForTest("project_corrupt", "깨진 저장소", "2026-07-01T01:00:00.000Z")), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });
  assert.equal(storage.getItem("app-xray.autosave-snapshots.v1"), JSON.stringify([malformedSnapshot]));

  const malformedSuggestedWorkspace = workspaceForTest("project_corrupt", "깨진 저장소", "2026-07-01T01:00:00.000Z");
  malformedSuggestedWorkspace.objects = {
    ...malformedSuggestedWorkspace.objects,
    screens: [
      {
        id: "screen_malformed_suggested",
        projectId: "project_corrupt",
        status: "suggested",
        createdAt: "2026-07-01T01:00:00.000Z",
        updatedAt: "2026-07-01T01:00:00.000Z",
      },
    ],
  };
  const malformedSuggestedSnapshot = {
    id: "snapshot_malformed_suggested",
    projectId: "project_corrupt",
    projectName: "깨진 저장소",
    createdAt: "2026-07-01T01:00:00.000Z",
    workspace: malformedSuggestedWorkspace,
    validation: { errors: [], warnings: [], isExportSafe: true },
  };
  storage.setItem("app-xray.autosave-snapshots.v1", JSON.stringify([malformedSuggestedSnapshot]));
  assert.deepEqual(restoreAutosaveSnapshot(storage, "snapshot_malformed_suggested"), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });
  assert.deepEqual(createAutosaveSnapshot(storage, workspaceForTest("project_corrupt", "깨진 저장소", "2026-07-01T01:00:00.000Z")), {
    ok: false,
    error: "자동 저장 기록을 읽을 수 없습니다.",
  });
  assert.equal(storage.getItem("app-xray.autosave-snapshots.v1"), JSON.stringify([malformedSuggestedSnapshot]));
});

test("backup import UI previews before merge or replace applies to the workspace", async () => {
  const current = workspaceForTest("project_current", "현재 프로젝트", "2026-07-01T01:00:00.000Z");
  const imported = workspaceForTest("project_imported", "가져온 백업", "2026-07-01T01:10:00.000Z");
  const app = await renderAppWithWorkspace(current);
  try {
    assert.match(document.querySelector("h1")?.textContent ?? "", /현재 프로젝트/);

    await importBackupFile(JSON.stringify({ schemaVersion: "1.0.0", exportedAt: "2026-07-01T01:12:00.000Z", workspace: imported }));

    assert.match(document.body.textContent, /가져온 백업/);
    assert.match(document.body.textContent, /병합/);
    assert.match(document.body.textContent, /교체/);
    assert.match(document.body.textContent, /취소/);
    assert.match(document.querySelector("h1")?.textContent ?? "", /현재 프로젝트/);

    await clickButton("백업으로 교체");

    assert.match(document.querySelector("h1")?.textContent ?? "", /가져온 백업/);
  } finally {
    await app.cleanup();
  }
});

test("snapshot restore UI shows project time and validation before applying", async () => {
  const current = workspaceForTest("project_restore_ui", "현재 프로젝트", "2026-07-01T01:00:00.000Z");
  const snapshotWorkspace = workspaceForTest("project_restore_ui", "자동 저장 이전", "2026-07-01T01:05:00.000Z");
  const app = await renderAppWithWorkspace(current, (storage) => {
    createAutosaveSnapshot(storage, snapshotWorkspace, {
      createdAt: "2026-07-01T01:06:00.000Z",
      snapshotId: "snapshot_restore_ui",
    });
  });
  try {
    assert.match(document.body.textContent, /자동 저장 이전/);
    assert.match(document.body.textContent, /내보내기 가능/);
    assert.match(document.body.textContent, /2026/);

    await clickButton("자동 저장 이전 2026-07-01T01:06:00.000Z 복원 미리보기");
    assert.match(document.querySelector("h1")?.textContent ?? "", /현재 프로젝트/);
    assert.match(document.body.textContent, /자동 저장 이전/);

    await clickButton("이 기록으로 복원");
    assert.match(document.querySelector("h1")?.textContent ?? "", /자동 저장 이전/);
  } finally {
    await app.cleanup();
  }
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

async function renderAppWithWorkspace(workspace, beforeRender = () => {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://127.0.0.1/#backup",
    pretendToBeVisual: true,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.InputEvent = dom.window.InputEvent;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.File = dom.window.File;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  globalThis.localStorage = dom.window.localStorage;
  localStorage.setItem(
    "app-xray.projects.v1",
    JSON.stringify({
      activeProjectId: workspace.project.id,
      workspaces: [workspace],
      updatedAt: workspace.updatedAt,
    }),
  );
  beforeRender(localStorage);
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID: createDeterministicUuid(),
    },
  });
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  dom.window.crypto.randomUUID = globalThis.crypto.randomUUID;
  dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  const [{ default: App }, { createRoot }] = await Promise.all([
    import("../dist/App.js"),
    import("react-dom/client"),
  ]);
  const root = createRoot(document.getElementById("root"));
  await act(async () => {
    root.render(React.createElement(App));
  });
  await flush();
  return {
    cleanup: async () => {
      await act(async () => root.unmount());
      dom.window.close();
      delete globalThis.window;
      delete globalThis.document;
      delete globalThis.Event;
      delete globalThis.InputEvent;
      delete globalThis.MouseEvent;
      delete globalThis.HTMLElement;
      delete globalThis.File;
      delete globalThis.navigator;
      delete globalThis.localStorage;
      delete globalThis.crypto;
      delete globalThis.requestAnimationFrame;
      delete globalThis.cancelAnimationFrame;
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    },
  };
}

async function importBackupFile(content) {
  const input = document.querySelector("#backup input[type='file']");
  assert.ok(input, "Missing backup import input");
  const file = new File([content], "backup.json", { type: "application/json" });
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  await act(async () => {
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush();
}

async function clickButton(name) {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name || candidate.getAttribute("aria-label") === name,
  );
  assert.ok(button, `Missing button: ${name}`);
  await act(async () => button.click());
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function createDeterministicUuid() {
  let id = 0;
  return () => {
    id += 1;
    return `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  };
}

function workspaceForTest(projectId, name, updatedAt) {
  return {
    project: {
      ...fieldPowerAppProject,
      id: projectId,
      name,
      updatedAt,
    },
    sourceDocuments: [
      {
        ...fieldPowerAppSourceDocument,
        projectId,
      },
    ],
    objects: fieldPowerAppSuggestionSet,
    buildPlanSuggestions: [],
    updatedAt,
  };
}
