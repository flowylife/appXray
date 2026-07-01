import type { AiProviderName } from "./settings.js";

export type RealAiProviderName = Exclude<AiProviderName, "mock">;

export type AiProviderMetadata = {
  provider: AiProviderName;
  label: string;
  description: string;
  defaultModel: string;
  requiresApiKey: boolean;
  supportsStructuredJson: boolean;
  endpointHost?: string;
  documentationUrl?: string;
};

export const AI_PROVIDER_REGISTRY = {
  mock: {
    provider: "mock",
    label: "Mock",
    description: "Local deterministic fixture used for offline App X-Ray demos and tests.",
    defaultModel: "mock-field-power-analysis",
    requiresApiKey: false,
    supportsStructuredJson: true,
  },
  openai: {
    provider: "openai",
    label: "OpenAI",
    description: "BYOK OpenAI-compatible JSON analysis using chat completions.",
    defaultModel: "gpt-4.1-mini",
    requiresApiKey: true,
    supportsStructuredJson: true,
    endpointHost: "api.openai.com",
    documentationUrl: "https://platform.openai.com/docs",
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    description: "BYOK Claude analysis using the Messages API.",
    defaultModel: "claude-3-5-sonnet-latest",
    requiresApiKey: true,
    supportsStructuredJson: true,
    endpointHost: "api.anthropic.com",
    documentationUrl: "https://docs.anthropic.com",
  },
  gemini: {
    provider: "gemini",
    label: "Gemini",
    description: "BYOK Google Gemini analysis using JSON response mode.",
    defaultModel: "gemini-1.5-pro",
    requiresApiKey: true,
    supportsStructuredJson: true,
    endpointHost: "generativelanguage.googleapis.com",
    documentationUrl: "https://ai.google.dev/gemini-api/docs",
  },
  openrouter: {
    provider: "openrouter",
    label: "OpenRouter",
    description: "BYOK OpenRouter analysis through its OpenAI-compatible chat API.",
    defaultModel: "openrouter/auto",
    requiresApiKey: true,
    supportsStructuredJson: true,
    endpointHost: "openrouter.ai",
    documentationUrl: "https://openrouter.ai/docs",
  },
} as const satisfies Record<AiProviderName, AiProviderMetadata>;

export function getAiProviderMetadata(provider: AiProviderName): AiProviderMetadata {
  return AI_PROVIDER_REGISTRY[provider];
}

export function isRealAiProviderName(provider: AiProviderName): provider is RealAiProviderName {
  return provider !== "mock";
}
