import type { AiAnalysisResult } from "../domain/ai-analysis.js";
import type { SourceDocument } from "../domain/types.js";
import { validateAiAnalysisResult } from "./adapter.js";
import { getAiProviderMetadata, isRealAiProviderName, type RealAiProviderName } from "./provider-registry.js";
import type { AiProviderConfig } from "./settings.js";
import { buildStructuredAnalysisPrompt } from "./structured-prompt.js";

export type HttpProviderErrorCode =
  | "missing_api_key"
  | "unsupported_provider"
  | "provider_error"
  | "invalid_json"
  | "invalid_response"
  | "timeout"
  | "network_error";

export type HttpProviderSuccess = {
  ok: true;
  provider: RealAiProviderName;
  modelName: string;
  checkedAt: string;
  result: AiAnalysisResult;
};

export type HttpProviderFailure = {
  ok: false;
  provider: RealAiProviderName | "mock";
  modelName: string;
  checkedAt: string;
  code: HttpProviderErrorCode;
  error: string;
  status?: number;
};

export type HttpProviderResult = HttpProviderSuccess | HttpProviderFailure;

export type HttpFetchInit = {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
};

export type HttpFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type HttpFetch = (url: string, init: HttpFetchInit) => Promise<HttpFetchResponse>;

export type AnalyzeWithHttpProviderOptions = {
  fetchImpl?: HttpFetch;
  timeoutMs?: number;
};

type ProviderRequest = {
  url: string;
  init: Omit<HttpFetchInit, "signal">;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ERROR_LENGTH = 280;

export async function analyzeWithHttpProvider(
  config: AiProviderConfig,
  input: { sourceDocument: SourceDocument },
  options: AnalyzeWithHttpProviderOptions = {},
): Promise<HttpProviderResult> {
  const checkedAt = new Date().toISOString();
  const metadata = getAiProviderMetadata(config.provider);
  const modelName = config.modelName.trim() || metadata.defaultModel;
  const apiKey = config.apiKey?.trim();

  if (!isRealAiProviderName(config.provider)) {
    return failure({
      provider: config.provider,
      modelName,
      checkedAt,
      code: "unsupported_provider",
      error: "Mock analysis does not use the HTTP provider.",
    });
  }

  if (!apiKey) {
    return failure({
      provider: config.provider,
      modelName,
      checkedAt,
      code: "missing_api_key",
      error: `${metadata.label} API key is required before analysis can run.`,
    });
  }

  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prompt = buildStructuredAnalysisPrompt(input);
  const request = createProviderRequest(config.provider, modelName, apiKey, prompt);
  const controller = new AbortController();

  try {
    const response = await fetchWithTimeout(fetchImpl, request, controller, timeoutMs);

    if (!response.ok) {
      return failure({
        provider: config.provider,
        modelName,
        checkedAt,
        code: "provider_error",
        error: await readProviderError(response, apiKey),
        status: response.status,
      });
    }

    const payload = await readJsonPayload(response);
    const content = extractProviderText(config.provider, payload);
    const parsed = parseJsonObject(content, apiKey);

    if (!parsed.ok) {
      return failure({
        provider: config.provider,
        modelName,
        checkedAt,
        code: "invalid_json",
        error: parsed.error,
      });
    }

    const validated = validateAiAnalysisResult(parsed.value);
    if (!validated.ok) {
      return failure({
        provider: config.provider,
        modelName,
        checkedAt,
        code: "invalid_response",
        error: `Provider returned JSON that does not match the App X-Ray analysis contract: ${validated.errors.join(" ")}`,
      });
    }

    return {
      ok: true,
      provider: config.provider,
      modelName,
      checkedAt,
      result: validated.result,
    };
  } catch (error) {
    if (error instanceof ProviderTimeoutError) {
      return failure({
        provider: config.provider,
        modelName,
        checkedAt,
        code: "timeout",
        error: `Provider request timed out after ${timeoutMs}ms.`,
      });
    }

    return failure({
      provider: config.provider,
      modelName,
      checkedAt,
      code: "network_error",
      error: sanitizeErrorMessage(error instanceof Error ? error.message : String(error), apiKey),
    });
  }
}

function createProviderRequest(
  provider: RealAiProviderName,
  modelName: string,
  apiKey: string,
  prompt: ReturnType<typeof buildStructuredAnalysisPrompt>,
): ProviderRequest {
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 6000,
          temperature: 0,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        }),
      },
    };
  }

  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName,
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: "user", parts: [{ text: prompt.user }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      },
    };
  }

  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://app-xray.local";
    headers["X-Title"] = "App X-Ray";
  }

  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    },
  };
}

async function fetchWithTimeout(
  fetchImpl: HttpFetch,
  request: ProviderRequest,
  controller: AbortController,
  timeoutMs: number,
): Promise<HttpFetchResponse> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImpl(request.url, {
        ...request.init,
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function readJsonPayload(response: HttpFetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function readProviderError(response: HttpFetchResponse, apiKey: string): Promise<string> {
  let raw = "";
  try {
    const payload = await response.json();
    raw = extractErrorMessage(payload);
  } catch {
    try {
      raw = await response.text();
    } catch {
      raw = "";
    }
  }

  const message = raw.trim() || `Provider returned HTTP ${response.status}.`;
  return sanitizeErrorMessage(message, apiKey);
}

function extractProviderText(provider: RealAiProviderName, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string") return record.output_text;

  if (provider === "anthropic") {
    const content = record.content;
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }

  if (provider === "gemini") {
    const candidates = record.candidates;
    const first = Array.isArray(candidates) ? candidates[0] : undefined;
    const parts = isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts) ? first.content.parts : [];
    return parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }

  const choices = record.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  if (isRecord(first) && isRecord(first.message) && typeof first.message.content === "string") {
    return first.message.content;
  }

  return "";
}

function parseJsonObject(text: string, apiKey: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const normalized = stripJsonFence(text);
  try {
    return { ok: true, value: JSON.parse(normalized) };
  } catch {
    return {
      ok: false,
      error: sanitizeErrorMessage("Provider response was not valid JSON for the App X-Ray analysis contract.", apiKey),
    };
  }
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.message === "string") return payload.message;

  const error = payload.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;

  return JSON.stringify(payload);
}

function failure(input: Omit<HttpProviderFailure, "ok">): HttpProviderFailure {
  const base = {
    ok: false as const,
    provider: input.provider,
    modelName: input.modelName,
    checkedAt: input.checkedAt,
    code: input.code,
    error: input.error,
  };

  return input.status === undefined ? base : { ...base, status: input.status };
}

function sanitizeErrorMessage(message: string, apiKey: string): string {
  const redacted = [apiKey]
    .filter(Boolean)
    .reduce((current, secret) => current.split(secret).join("[redacted]"), message)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]");

  return redacted.length > MAX_ERROR_LENGTH ? `${redacted.slice(0, MAX_ERROR_LENGTH)}...` : redacted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

const defaultFetch: HttpFetch = (url, init) => fetch(url, init) as Promise<HttpFetchResponse>;

class ProviderTimeoutError extends Error {
  constructor() {
    super("Provider request timed out.");
  }
}
