import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { ExportPanel } from "../dist/components/ExportPanel.js";
import { updateXrayObjectStatus } from "../dist/domain/lifecycle.js";
import { fieldPowerAppProject, fieldPowerAppSourceDocument, fieldPowerAppSuggestionSet } from "../dist/fixtures/field-power-app.js";

let dom;
let root;
let container;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://127.0.0.1/#/projects/project_export/export",
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
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
  delete globalThis.MouseEvent;
  delete globalThis.HTMLElement;
  delete globalThis.navigator;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test("export panel labels canonical and audit export modes and explains formats", async () => {
  await renderPanel({ activeExport: "dataObjectsCsv" });

  assert.match(document.body.textContent, /확정 데이터만 내보내는 기본 모드/);
  assert.match(document.body.textContent, /검토 이력 포함 모드/);
  assert.match(document.body.textContent, /앱이 저장할 정보를 표 형태로 검토하거나 스프레드시트로 옮길 때 사용합니다/);
  assert.match(document.body.textContent, /파일명: app-xray-현장-전력설비-관리-앱-data-objects.csv/);

  await clickButton("Issues CSV");
  assert.match(document.body.textContent, /빠진 결정 사항을 표 형태로 분류하고 우선순위를 정할 때 사용합니다/);
});

test("copy preview reports success and failure states", async () => {
  const copied = [];
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => copied.push(value),
    },
  });
  await renderPanel({ activeExport: "markdown" });

  await clickButton("미리보기 복사");
  assert.equal(copied.length, 1);
  assert.match(copied[0], /현장 전력설비 관리 앱/);
  assert.match(document.body.textContent, /미리보기를 클립보드에 복사했습니다/);

  navigator.clipboard.writeText = async () => {
    throw new Error("denied");
  };
  await clickButton("미리보기 복사");
  assert.match(document.body.textContent, /클립보드에 복사할 수 없습니다/);
});

async function renderPanel({ activeExport }) {
  root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(ExportPanel, {
        activeExport,
        workspace: exportPanelWorkspace(),
        onExportChange: (nextType) => {
          root.render(
            React.createElement(ExportPanel, {
              activeExport: nextType,
              workspace: exportPanelWorkspace(),
              onExportChange: () => {},
            }),
          );
        },
      }),
    );
  });
  await flush();
}

async function clickButton(name) {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name,
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

function exportPanelWorkspace() {
  const [screen] = fieldPowerAppSuggestionSet.screens;
  const [dataObject] = fieldPowerAppSuggestionSet.dataObjects;
  const [field] = fieldPowerAppSuggestionSet.dataFields;
  const [issue] = fieldPowerAppSuggestionSet.issues;
  assert.ok(screen);
  assert.ok(dataObject);
  assert.ok(field);
  assert.ok(issue);

  return {
    project: fieldPowerAppProject,
    sourceDocuments: [fieldPowerAppSourceDocument],
    objects: {
      requirements: [],
      screens: [updateXrayObjectStatus(screen, "accepted")],
      features: [],
      dataObjects: [updateXrayObjectStatus(dataObject, "accepted")],
      dataFields: [updateXrayObjectStatus({ ...field, dataObjectId: dataObject.id }, "accepted")],
      dataRelations: [],
      roles: [],
      permissions: [],
      flows: [],
      flowSteps: [],
      issues: [updateXrayObjectStatus(issue, "accepted")],
    },
    buildPlanSuggestions: [],
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}
