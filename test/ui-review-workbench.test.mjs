import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";

let dom;
let root;
let container;
let App;
let createRoot;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://127.0.0.1/#/projects/new",
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

test("review workbench filters by bucket status and search text", async () => {
  await createAnalyzedProject();

  await selectLabeledControl("제안 종류 필터", "screens");
  assert.ok(reviewGroup("화면"));
  assert.equal(Boolean(reviewGroup("앱이 저장할 정보")), false);

  await clickButton("검토 대기");
  assert.ok(reviewRow("화면", "대시보드"));

  await fillLabeledControl("제안 검색", "모아서");
  assert.ok(reviewRow("화면", "알람"));
  assert.equal(Boolean(reviewRow("화면", "대시보드")), false);
});

test("review workbench supports bulk action inline edit and undo", async () => {
  await createAnalyzedProject();

  await selectLabeledControl("제안 종류 필터", "screens");
  await clickButton("화면 표시 항목 모두 확정");
  assert.match(reviewGroup("화면").textContent, /확정 [1-9]/);

  await clickButton("최근 판정 되돌리기");
  assert.match(reviewGroup("화면").textContent, /검토 대기 [1-9]/);

  await selectLabeledControl("제안 종류 필터", "dataObjects");
  await fillLabeledControl("제안 검색", "부하");
  const row = reviewRow("앱이 저장할 정보", "부하");
  assert.ok(row);
  await clickWithin(row, "수정");
  await fillWithin(row, "쉬운 이름", "부하 워크벤치 검증");
  await clickWithin(row, "저장");

  assert.ok(reviewRow("앱이 저장할 정보", "부하 워크벤치 검증"));
  assert.match(reviewRow("앱이 저장할 정보", "부하 워크벤치 검증").textContent, /수정 확정/);

  await clickButton("최근 판정 되돌리기");
  assert.ok(reviewRow("앱이 저장할 정보", "부하"));
  assert.equal(Boolean(reviewRow("앱이 저장할 정보", "부하 워크벤치 검증")), false);
});

test("review workbench exposes merge impact after rerun", async () => {
  await createAnalyzedProject();

  await clickWithin(reviewRow("화면", "대시보드"), "확정");
  await clickButton("Mock 재분석");

  const panel = document.querySelector("[aria-label='재분석 영향']");
  assert.ok(panel, "Missing merge impact panel");
  assert.match(panel.textContent, /새 제안/);
  assert.match(panel.textContent, /갱신 제안/);
  assert.match(panel.textContent, /보존된 확정/);
  assert.match(panel.textContent, /보존된 판정/);
  assert.match(panel.textContent, /상태 변경/);
});

async function createAnalyzedProject() {
  await renderApp();
  await fillLabeledControl("프로젝트 이름", "리뷰 워크벤치 앱");
  await clickButton("저장하고 Mock 분석");
  assert.match(document.body.textContent, /AI 제안 초안/);
}

async function renderApp(hash = "#/projects/new") {
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

async function fillLabeledControl(labelText, value) {
  const control = findLabeledControl(document, labelText);
  await setControlValue(control, value);
}

async function selectLabeledControl(labelText, value) {
  const control = findLabeledControl(document, labelText);
  await setControlValue(control, value);
}

async function fillWithin(scope, labelText, value) {
  const control = findLabeledControl(scope, labelText);
  await setControlValue(control, value);
}

async function setControlValue(control, value) {
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

function findLabeledControl(scope, labelText) {
  const label = Array.from(scope.querySelectorAll("label")).find((candidate) =>
    candidate.textContent?.includes(labelText),
  );
  assert.ok(label, `Missing label: ${labelText}`);
  const control = label.querySelector("input, textarea, select");
  assert.ok(control, `Missing control for label: ${labelText}`);
  return control;
}

async function clickButton(name) {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name,
  );
  assert.ok(button, `Missing button: ${name}`);
  await act(async () => button.click());
  await flush();
}

async function clickWithin(scope, name) {
  const button = Array.from(scope.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name,
  );
  assert.ok(button, `Missing button: ${name}`);
  await act(async () => button.click());
  await flush();
}

function reviewGroup(groupName) {
  return Array.from(document.querySelectorAll(".review-group")).find((candidate) =>
    candidate.getAttribute("aria-label") === `리뷰 그룹: ${groupName}`,
  );
}

function reviewRow(groupName, itemName) {
  return Array.from(document.querySelectorAll(".review-row")).find((candidate) => {
    const label = candidate.getAttribute("aria-label") ?? "";
    return label.includes(`리뷰 항목: ${groupName} - `) && label.includes(itemName);
  });
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
