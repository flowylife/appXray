export type AiProviderName = "mock" | "openai" | "anthropic" | "gemini" | "openrouter";

export type AiProviderConfig = {
  provider: AiProviderName;
  modelName: string;
  apiKey?: string | undefined;
  apiKeyPresent: boolean;
  lastValidatedAt?: string | undefined;
};

export type AiProviderPublicConfig = Omit<AiProviderConfig, "apiKey">;

const AI_SETTINGS_KEY = "app-xray.ai-settings.v1";

export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
  provider: "mock",
  modelName: "mock-field-power-analysis",
  apiKeyPresent: false,
};

export function loadAiProviderConfig(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): AiProviderConfig {
  const raw = storage.getItem(AI_SETTINGS_KEY);
  if (!raw) return DEFAULT_AI_PROVIDER_CONFIG;

  try {
    return normalizeConfig(JSON.parse(raw) as Partial<AiProviderConfig>);
  } catch {
    return DEFAULT_AI_PROVIDER_CONFIG;
  }
}

export function saveAiProviderConfig(
  config: AiProviderConfig,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  storage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalizeConfig(config)));
}

export function toPublicAiProviderConfig(config: AiProviderConfig): AiProviderPublicConfig {
  const { apiKey: _apiKey, ...publicConfig } = normalizeConfig(config);
  return publicConfig;
}

function normalizeConfig(config: Partial<AiProviderConfig>): AiProviderConfig {
  const apiKey = config.apiKey?.trim() || undefined;
  return {
    provider: config.provider ?? "mock",
    modelName: config.modelName?.trim() || defaultModelFor(config.provider ?? "mock"),
    apiKey,
    apiKeyPresent: Boolean(apiKey || config.apiKeyPresent),
    lastValidatedAt: config.lastValidatedAt,
  };
}

function defaultModelFor(provider: AiProviderName): string {
  return {
    mock: "mock-field-power-analysis",
    openai: "gpt-4.1-mini",
    anthropic: "claude-3-5-sonnet-latest",
    gemini: "gemini-1.5-pro",
    openrouter: "openrouter/auto",
  }[provider];
}
