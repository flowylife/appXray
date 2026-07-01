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
  globalThis.File = dom.window.File;
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
  delete globalThis.File;
  delete globalThis.navigator;
  delete globalThis.localStorage;
  delete globalThis.crypto;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test("csv import shows source type and creates one source version", async () => {
  await renderApp();

  await fillLabeledControl("프로젝트 이름", "CSV 고객 관리 앱");
  await importSourceFile("customers.csv", "name,email\n홍길동,hong@example.com");
  assert.match(document.body.textContent, /최근 가져오기:/);
  await clickButton("프로젝트 저장");

  assert.match(document.body.textContent, /원문 종류: CSV/);
  assert.match(document.body.textContent, /원문 버전: 1개/);
  assert.match(localStorage.getItem("app-xray.projects.v1") ?? "", /CSV headers: name, email/);
});

test("json import pretty prints content and duplicate save does not add a source version", async () => {
  await renderApp();

  await fillLabeledControl("프로젝트 이름", "JSON 워크플로 앱");
  await importSourceFile("workflow.json", "{\"screen\":\"대시보드\",\"enabled\":true}");
  await clickButton("프로젝트 저장");
  await clickButton("현재 변경 저장");

  assert.match(document.body.textContent, /원문 종류: JSON/);
  assert.match(document.body.textContent, /원문 버전: 1개/);
  const stored = JSON.parse(localStorage.getItem("app-xray.projects.v1") ?? "{}");
  const content = stored.workspaces[0].sourceDocuments[0].content;
  assert.match(content, /"screen": "대시보드"/);
  assert.match(content, /"enabled": true/);
});

test("pasted text remains supported and unsupported files show Korean errors", async () => {
  await renderApp();

  await fillLabeledControl("아이디어 / PRD", "붙여넣은 회의 메모");
  assert.match(document.body.textContent, /원문 종류: 일반 텍스트/);

  await importSourceFile("diagram.png", "\u0000PNG");
  assert.match(document.body.textContent, /지원하지 않는 파일 형식입니다/);
  assert.ok(document.querySelector(".notice.error")?.textContent?.includes("지원하지 않는 파일 형식입니다"));

  await importSourceFile("broken.json", "{\"screen\":");
  assert.match(document.body.textContent, /JSON 형식을 읽을 수 없습니다/);
  assert.ok(document.querySelector(".notice.error")?.textContent?.includes("JSON 형식을 읽을 수 없습니다"));

  await importSourceFile("empty.csv", " \n ");
  assert.match(document.body.textContent, /CSV 파일이 비어 있습니다/);
  assert.ok(document.querySelector(".notice.error")?.textContent?.includes("CSV 파일이 비어 있습니다"));
});

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
  const label = Array.from(document.querySelectorAll("label")).find((candidate) =>
    candidate.textContent?.includes(labelText),
  );
  assert.ok(label, `Missing label: ${labelText}`);
  const control = label.querySelector("input, textarea, select");
  assert.ok(control, `Missing control for label: ${labelText}`);
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

async function importSourceFile(fileName, content) {
  const input = document.querySelector("input[type='file'][aria-label='원문 파일 가져오기']");
  assert.ok(input, "Missing source import input");
  const file = new File([content], fileName);
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

function createDeterministicUuid() {
  let index = 0;
  return () => {
    index += 1;
    return String(index).padStart(4, "0");
  };
}
