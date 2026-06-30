import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";

import { updateXrayObjectStatus } from "../dist/domain/lifecycle.js";
import { fieldPowerAppProject, fieldPowerAppSourceDocument, fieldPowerAppSuggestionSet } from "../dist/fixtures/field-power-app.js";

let dom;
let root;
let container;
let App;
let createRoot;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://127.0.0.1/#/projects/project_validation/export",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.InputEvent = dom.window.InputEvent;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.HashChangeEvent = dom.window.HashChangeEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  globalThis.localStorage = dom.window.localStorage;
  localStorage.clear();
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
  dom.window.confirm = () => true;
  container = document.getElementById("root");
});

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
    root = undefined;
  }
  dom?.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.Event;
  delete globalThis.InputEvent;
  delete globalThis.MouseEvent;
  delete globalThis.HashChangeEvent;
  delete globalThis.HTMLElement;
  delete globalThis.navigator;
  delete globalThis.localStorage;
  delete globalThis.crypto;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test("export validation list can jump to the affected review object", async () => {
  seedBrokenRelationWorkspace();
  await renderApp("#/projects/project_validation/export");

  const validationPanel = document.querySelector("[aria-label='내보내기 점검']");
  assert.ok(validationPanel);
  assert.match(validationPanel.textContent, /연결이 끊긴 정보 구조 관계/);

  await clickWithin(validationPanel, "검토로 이동");

  assert.equal(window.location.hash, "#/projects/project_validation/review");
  const row = document.querySelector("#review-dataRelations-relation_broken");
  assert.ok(row);
  assert.match(row.textContent, /내보내기 차단/);
});

test("validation jump reveals the target when review filters previously hid it", async () => {
  seedBrokenRelationWorkspace();
  await renderApp("#/projects/project_validation/review");

  await selectLabeledControl("제안 종류 필터", "screens");
  assert.equal(Boolean(document.querySelector("#review-dataRelations-relation_broken")), false);

  await clickLink("내보내기");
  const validationPanel = document.querySelector("[aria-label='내보내기 점검']");
  assert.ok(validationPanel);
  await clickWithin(validationPanel, "검토로 이동");

  assert.equal(window.location.hash, "#/projects/project_validation/review");
  const row = document.querySelector("#review-dataRelations-relation_broken");
  assert.ok(row);
  assert.match(row.textContent, /내보내기 차단/);
});

test("safe validation repair excludes a broken relation without deleting the row", async () => {
  seedBrokenRelationWorkspace();
  await renderApp("#/projects/project_validation/export");

  const validationPanel = document.querySelector("[aria-label='내보내기 점검']");
  assert.ok(validationPanel);
  await clickWithin(validationPanel, "끊긴 연결 제외");

  assert.doesNotMatch(document.querySelector("[aria-label='내보내기 점검']").textContent, /내보내기 전에 고칠 것 1/);
  await clickLink("분석 검토");
  const row = document.querySelector("#review-dataRelations-relation_broken");
  assert.ok(row);
  assert.match(row.textContent, /제외/);
});

async function renderApp(hash) {
  window.location.hash = hash;
  if (!App) {
    ({ default: App } = await import("../dist/App.js"));
    ({ createRoot } = await import("react-dom/client"));
  }
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(App));
  });
  await flush();
}

function seedBrokenRelationWorkspace() {
  const [source] = fieldPowerAppSuggestionSet.dataObjects;
  const [relation] = fieldPowerAppSuggestionSet.dataRelations;
  assert.ok(source);
  assert.ok(relation);
  const workspace = {
    project: { ...fieldPowerAppProject, id: "project_validation", name: "검증 수리 앱" },
    sourceDocuments: [{ ...fieldPowerAppSourceDocument, projectId: "project_validation" }],
    objects: {
      requirements: [],
      screens: [],
      features: [],
      dataObjects: [updateXrayObjectStatus({ ...source, projectId: "project_validation" }, "accepted")],
      dataFields: [],
      dataRelations: [
        updateXrayObjectStatus(
          {
            ...relation,
            id: "relation_broken",
            projectId: "project_validation",
            sourceObjectId: source.id,
            targetObjectId: "missing_target",
          },
          "accepted",
        ),
      ],
      roles: [],
      permissions: [],
      flows: [],
      flowSteps: [],
      issues: [],
    },
    buildPlanSuggestions: [],
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
  localStorage.setItem(
    "app-xray.projects.v1",
    JSON.stringify({
      activeProjectId: "project_validation",
      workspaces: [workspace],
      updatedAt: workspace.updatedAt,
    }),
  );
}

async function clickWithin(scope, name) {
  const button = Array.from(scope.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name,
  );
  assert.ok(button, `Missing button: ${name}`);
  await act(async () => button.click());
  await flush();
}

async function clickLink(name) {
  const link = Array.from(document.querySelectorAll("a")).find((candidate) =>
    candidate.textContent?.trim() === name,
  );
  assert.ok(link, `Missing link: ${name}`);
  await act(async () => {
    link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    window.location.hash = link.getAttribute("href");
    window.dispatchEvent(new window.HashChangeEvent("hashchange"));
  });
  await flush();
}

async function selectLabeledControl(labelText, value) {
  const label = Array.from(document.querySelectorAll("label")).find((candidate) =>
    candidate.textContent?.includes(labelText),
  );
  assert.ok(label, `Missing label: ${labelText}`);
  const control = label.querySelector("select");
  assert.ok(control, `Missing select for label: ${labelText}`);
  await act(async () => {
    const previousValue = control.value;
    const descriptor = Object.getOwnPropertyDescriptor(control.constructor.prototype, "value");
    descriptor?.set?.call(control, value);
    control._valueTracker?.setValue(previousValue);
    control.dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    control.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function createDeterministicUuid() {
  let index = 0;
  return () => {
    index += 1;
    return String(index).padStart(4, "0");
  };
}
