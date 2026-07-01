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
    url: "http://127.0.0.1/#/projects",
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

test("empty project list explains the next action in Korean", async () => {
  await renderApp();

  assert.match(document.body.textContent, /아직 저장된 프로젝트가 없습니다/);
  assert.match(document.body.textContent, /새 프로젝트를 만들어 원문을 저장하세요/);
  assert.equal(window.location.hash, "#/projects");
});

test("new project form validates user-provided name and source text", async () => {
  await renderApp("#/projects/new");

  await fillLabeledControl("프로젝트 이름", "");
  await fillLabeledControl("아이디어 / PRD", "");
  await clickButton("프로젝트 저장");

  assert.match(document.body.textContent, /프로젝트 이름을 입력하세요/);
  assert.match(document.body.textContent, /아이디어나 PRD 원문을 입력하세요/);
  assert.equal(document.querySelectorAll("[aria-label='로컬 프로젝트 목록'] .project-item").length, 0);
});

test("successful creation persists user source text and opens the project review route", async () => {
  await renderApp("#/projects/new");

  await fillLabeledControl("프로젝트 이름", "고객 상담 앱");
  await fillLabeledControl("아이디어 / PRD", "상담 접수와 처리 이력을 관리한다.");
  await clickButton("프로젝트 저장");

  assert.match(document.body.textContent, /고객 상담 앱/);
  assert.match(document.body.textContent, /로컬 저장됨/);
  assert.equal(window.location.hash, "#/projects/project_0001/review");
  assert.match(localStorage.getItem("app-xray.projects.v1"), /상담 접수와 처리 이력을 관리한다/);
});

test("users can switch projects without route drift", async () => {
  await renderApp("#/projects/new");
  await createProject("첫 프로젝트", "첫 번째 원문");
  await createProject("둘 프로젝트", "두 번째 원문");

  await clickProject("첫 프로젝트");

  assert.match(document.querySelector("h1")?.textContent ?? "", /첫 프로젝트/);
  assert.equal(window.location.hash, "#/projects/project_0001/review");

  await clickProject("둘 프로젝트");

  assert.match(document.querySelector("h1")?.textContent ?? "", /둘 프로젝트/);
  assert.equal(window.location.hash, "#/projects/project_0003/review");
});

test("users can rename a project without changing its route", async () => {
  await renderApp("#/projects/new");
  await createProject("이름 변경 전", "이름 변경 원문");

  await fillLabeledControl("프로젝트 이름", "이름 변경 후");
  await clickButton("현재 변경 저장");

  assert.match(document.querySelector("h1")?.textContent ?? "", /이름 변경 후/);
  assert.equal(window.location.hash, "#/projects/project_0001/review");
  assert.match(localStorage.getItem("app-xray.projects.v1"), /이름 변경 후/);
  assert.doesNotMatch(localStorage.getItem("app-xray.projects.v1"), /이름 변경 전/);
});

test("duplicate project rename is rejected without overwriting persisted projects", async () => {
  await renderApp("#/projects/new");
  await createProject("기준 프로젝트", "기준 원문");
  await createProject("변경 대상 프로젝트", "변경 대상 원문");

  await fillLabeledControl("프로젝트 이름", "기준 프로젝트");
  await clickButton("현재 변경 저장");

  assert.match(document.body.textContent, /같은 이름의 로컬 프로젝트가 이미 있습니다/);
  assert.match(document.querySelector("h1")?.textContent ?? "", /변경 대상 프로젝트/);
  assert.equal(window.location.hash, "#/projects/project_0003/review");
  const stored = localStorage.getItem("app-xray.projects.v1") ?? "";
  assert.match(stored, /기준 프로젝트/);
  assert.match(stored, /변경 대상 프로젝트/);
});

test("deletion requires an explicit confirmation state and keeps another project active", async () => {
  await renderApp("#/projects/new");
  await createProject("삭제 대상", "삭제할 원문");
  await createProject("남길 프로젝트", "남길 원문");

  await clickDelete("삭제 대상");
  assert.match(document.body.textContent, /삭제 확인/);
  assert.match(document.body.textContent, /남길 프로젝트/);

  await clickDelete("삭제 대상");

  assert.doesNotMatch(document.body.textContent, /삭제 대상/);
  assert.match(document.querySelector("h1")?.textContent ?? "", /남길 프로젝트/);
  assert.equal(window.location.hash, "#/projects/project_0003/review");
  assert.match(localStorage.getItem("app-xray.projects.v1"), /남길 프로젝트/);
});

test("corrupt local project collection shows a visible recovery state", async () => {
  localStorage.setItem("app-xray.projects.v1", "{not-json");
  await renderApp("#/projects");

  assert.match(document.body.textContent, /저장된 로컬 프로젝트 목록을 읽을 수 없어/);
  assert.match(document.body.textContent, /새 프로젝트로 다시 시작할 수 있습니다/);
});

test("AI provider switch clears the previous provider API key before saving", async () => {
  await renderApp("#/settings/ai");

  await fillLabeledControl("AI 제공자", "openai");
  await fillLabeledControl("API Key", "test-openai-key-redacted-1234567890");
  await clickButton("설정 저장");
  assert.match(localStorage.getItem("app-xray.ai-settings.v1"), /test-openai-key-redacted/);

  await fillLabeledControl("AI 제공자", "anthropic");
  await clickButton("설정 저장");

  const stored = JSON.parse(localStorage.getItem("app-xray.ai-settings.v1"));
  assert.equal(stored.provider, "anthropic");
  assert.equal(stored.apiKey, undefined);
  assert.equal(stored.apiKeyPresent, false);
});

async function renderApp(hash = "#/projects") {
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

async function createProject(name, sourceText) {
  await clickLink("새 프로젝트");
  await fillLabeledControl("프로젝트 이름", name);
  await fillLabeledControl("아이디어 / PRD", sourceText);
  await clickButton("프로젝트 저장");
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

async function clickButton(name) {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name,
  );
  assert.ok(button, `Missing button: ${name}`);
  await act(async () => button.click());
  await flush();
}

async function clickProject(name) {
  const switcher = document.querySelector("[aria-label='로컬 프로젝트 목록']");
  const button = Array.from(switcher.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.trim() === name,
  );
  assert.ok(button, `Missing project button: ${name}`);
  await act(async () => button.click());
  await flush();
}

async function clickDelete(name) {
  const button = document.querySelector(`[aria-label='${name} 삭제']`);
  assert.ok(button, `Missing delete button for: ${name}`);
  await act(async () => button.click());
  await flush();
}

async function clickLink(name) {
  const link = Array.from(document.querySelectorAll("a")).find((candidate) => candidate.textContent?.trim() === name);
  assert.ok(link, `Missing link: ${name}`);
  await act(async () => {
    link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    window.location.hash = link.getAttribute("href");
    window.dispatchEvent(new window.HashChangeEvent("hashchange"));
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
