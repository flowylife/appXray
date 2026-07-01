import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeWithHttpProvider } from "../dist/ai/http-provider.js";
import { AI_PROVIDER_REGISTRY, getAiProviderMetadata } from "../dist/ai/provider-registry.js";
import { APP_XRAY_ANALYSIS_JSON_INSTRUCTIONS, buildStructuredAnalysisPrompt } from "../dist/ai/structured-prompt.js";

const SECRET_API_KEY = "test-api-key-redacted-1234567890";

const sourceDocument = {
  id: "src_test",
  projectId: "project_test",
  title: "Maintenance Tracker PRD",
  content: "Build a maintenance tracker with asset records, technicians, work orders, and admin permissions.",
  sourceType: "text",
  version: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
};

test("provider registry exposes metadata for every supported provider without secrets", () => {
  assert.deepEqual(Object.keys(AI_PROVIDER_REGISTRY), ["mock", "openai", "anthropic", "gemini", "openrouter"]);
  assert.equal(getAiProviderMetadata("openai").supportsStructuredJson, true);
  assert.equal(getAiProviderMetadata("mock").requiresApiKey, false);
  assert.equal(getAiProviderMetadata("anthropic").requiresApiKey, true);

  const serialized = JSON.stringify(AI_PROVIDER_REGISTRY);
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(serialized.includes(SECRET_API_KEY), false);
});

test("structured prompt embeds the App X-Ray JSON-only extraction contract", () => {
  const prompt = buildStructuredAnalysisPrompt({ sourceDocument });

  assert.equal(prompt.system.includes("Return JSON only"), true);
  assert.equal(prompt.user.includes(sourceDocument.content), true);
  assert.equal(APP_XRAY_ANALYSIS_JSON_INSTRUCTIONS.includes('"requirements"'), true);
  assert.equal(APP_XRAY_ANALYSIS_JSON_INSTRUCTIONS.includes('"buildPlan"'), true);
  assert.equal(APP_XRAY_ANALYSIS_JSON_INSTRUCTIONS.includes("AI suggests"), true);
});

test("http provider normalizes an OpenAI success response into validated analysis JSON", async () => {
  const fetchCalls = [];
  const fetchImpl = async (url, init) => {
    fetchCalls.push({ url, init });
    return jsonResponse(200, {
      choices: [{ message: { content: JSON.stringify(validAnalysisResult()) } }],
    });
  };

  const result = await analyzeWithHttpProvider(
    {
      provider: "openai",
      modelName: "gpt-4.1-mini",
      apiKey: SECRET_API_KEY,
      apiKeyPresent: true,
    },
    { sourceDocument },
    { fetchImpl },
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider, "openai");
  assert.equal(result.modelName, "gpt-4.1-mini");
  assert.equal(result.result.summary.appName, "Maintenance Tracker");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(fetchCalls[0].init.headers.Authorization, `Bearer ${SECRET_API_KEY}`);
  assertNoSecret(result);
});

test("http provider reports invalid JSON without returning the raw API key", async () => {
  const result = await analyzeWithHttpProvider(
    {
      provider: "anthropic",
      modelName: "claude-3-5-sonnet-latest",
      apiKey: SECRET_API_KEY,
      apiKeyPresent: true,
    },
    { sourceDocument },
    {
      fetchImpl: async () =>
        jsonResponse(200, {
          content: [{ type: "text", text: "not-json " + SECRET_API_KEY }],
        }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_json");
  assert.equal(result.error.includes(SECRET_API_KEY), false);
  assertNoSecret(result);
});

test("http provider reports provider errors without leaking echoed API keys", async () => {
  const result = await analyzeWithHttpProvider(
    {
      provider: "openrouter",
      modelName: "openrouter/auto",
      apiKey: SECRET_API_KEY,
      apiKeyPresent: true,
    },
    { sourceDocument },
    {
      fetchImpl: async () =>
        jsonResponse(
          401,
          {
            error: {
              message: `Rejected credential ${SECRET_API_KEY}`,
            },
          },
          false,
        ),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "provider_error");
  assert.equal(result.status, 401);
  assert.equal(result.error.includes(SECRET_API_KEY), false);
  assert.equal(result.error.includes("[redacted]"), true);
  assertNoSecret(result);
});

test("http provider rejects missing API keys before fetch is called", async () => {
  let called = false;

  const result = await analyzeWithHttpProvider(
    {
      provider: "gemini",
      modelName: "gemini-1.5-pro",
      apiKeyPresent: false,
    },
    { sourceDocument },
    {
      fetchImpl: async () => {
        called = true;
        return jsonResponse(200, {});
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_api_key");
  assert.equal(called, false);
  assertNoSecret(result);
});

test("http provider times out and aborts the request", async () => {
  let aborted = false;
  const fetchImpl = async (_url, init) => {
    init.signal.addEventListener("abort", () => {
      aborted = true;
    });
    return new Promise(() => {});
  };

  const result = await analyzeWithHttpProvider(
    {
      provider: "openai",
      modelName: "gpt-4.1-mini",
      apiKey: SECRET_API_KEY,
      apiKeyPresent: true,
    },
    { sourceDocument },
    { fetchImpl, timeoutMs: 10 },
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "timeout");
  assert.equal(aborted, true);
  assertNoSecret(result);
});

function validAnalysisResult() {
  return {
    summary: {
      appName: "Maintenance Tracker",
      appTypes: ["internal tool"],
      confidence: 0.91,
      plainLanguageSummary: "Tracks maintenance work and assets.",
      targetUsers: ["technicians", "admins"],
    },
    requirements: [
      {
        tempId: "req_asset_records",
        confidence: 0.9,
        text: "Users need asset records.",
        requirementType: "data",
      },
    ],
    screens: [
      {
        tempId: "screen_dashboard",
        confidence: 0.84,
        name: "dashboard",
        screenType: "dashboard",
      },
    ],
    features: [
      {
        tempId: "feature_view_assets",
        confidence: 0.86,
        name: "view assets",
        actionType: "read",
        screenTempId: "screen_dashboard",
      },
    ],
    dataObjects: [
      {
        tempId: "object_asset",
        confidence: 0.88,
        name: "asset",
        objectType: "asset",
        fields: [
          {
            tempId: "field_asset_name",
            confidence: 0.9,
            name: "name",
            fieldType: "text",
            required: true,
          },
        ],
      },
    ],
    dataRelations: [],
    roles: [
      {
        tempId: "role_admin",
        confidence: 0.82,
        name: "admin",
      },
    ],
    permissions: [
      {
        tempId: "perm_admin_project",
        confidence: 0.8,
        roleTempId: "role_admin",
        targetType: "project",
        action: "manage",
        allowed: true,
      },
    ],
    flows: [
      {
        tempId: "flow_review_assets",
        confidence: 0.77,
        name: "Review assets",
        primaryRoleTempId: "role_admin",
        steps: [
          {
            tempId: "step_open_dashboard",
            confidence: 0.76,
            stepOrder: 1,
            screenTempId: "screen_dashboard",
            actionDescription: "Open the dashboard.",
          },
        ],
      },
    ],
    issues: [
      {
        tempId: "issue_status_values",
        confidence: 0.7,
        issueType: "missing",
        severity: "medium",
        title: "Missing status values",
        description: "Work order status values are not specified.",
      },
    ],
    buildPlan: [
      {
        tempId: "build_data_model",
        confidence: 0.78,
        title: "Create data model",
        description: "Start with assets and work orders.",
      },
    ],
  };
}

function jsonResponse(status, body, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function assertNoSecret(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(SECRET_API_KEY), false);
  assert.equal(serialized.includes("apiKey"), false);
}
