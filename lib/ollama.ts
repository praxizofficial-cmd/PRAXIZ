export function ollamaGenerateUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized.endsWith("/api")
    ? `${normalized}/generate`
    : `${normalized}/api/generate`;
}

export function ollamaTagsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized.endsWith("/api")
    ? `${normalized}/tags`
    : `${normalized}/api/tags`;
}

export function ollamaHeaders(apiKey?: string) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
  };
}

export type OllamaFailureKind =
  | "CONFIGURATION_MISSING"
  | "CONFIGURATION_INVALID"
  | "PROVIDER_UNREACHABLE"
  | "MODEL_UNAVAILABLE"
  | "AUTHENTICATION_FAILED"
  | "TIMEOUT"
  | "INVALID_PROVIDER_RESPONSE"
  | "MODEL_OUTPUT_INVALID"
  | "INTERNAL_ERROR";

const failureCopy: Record<OllamaFailureKind, string> = {
  CONFIGURATION_MISSING: "PRAXIZ AI is temporarily unavailable. Please try again later.",
  CONFIGURATION_INVALID: "PRAXIZ AI is temporarily unavailable. Please try again later.",
  PROVIDER_UNREACHABLE: "PRAXIZ AI is temporarily unavailable. Please try again later.",
  MODEL_UNAVAILABLE: "PRAXIZ AI is temporarily unavailable. Please try again later.",
  AUTHENTICATION_FAILED: "PRAXIZ AI is temporarily unavailable. Please try again later.",
  TIMEOUT: "PRAXIZ AI took too long to respond. Please try again.",
  INVALID_PROVIDER_RESPONSE: "PRAXIZ AI returned an invalid response. Please try again.",
  MODEL_OUTPUT_INVALID: "PRAXIZ AI returned an invalid response. Please try again.",
  INTERNAL_ERROR: "PRAXIZ AI could not process the request. Please try again.",
};

const failureStatus: Record<OllamaFailureKind, number> = {
  CONFIGURATION_MISSING: 503,
  CONFIGURATION_INVALID: 503,
  PROVIDER_UNREACHABLE: 503,
  MODEL_UNAVAILABLE: 503,
  AUTHENTICATION_FAILED: 503,
  TIMEOUT: 504,
  INVALID_PROVIDER_RESPONSE: 502,
  MODEL_OUTPUT_INVALID: 502,
  INTERNAL_ERROR: 500,
};

export class OllamaRequestError extends Error {
  public readonly kind: OllamaFailureKind;
  public readonly status: number;

  constructor(kind: OllamaFailureKind, message = failureCopy[kind], status = failureStatus[kind]) {
    super(message);
    this.name = "OllamaRequestError";
    this.kind = kind;
    this.status = status;
  }
}

function assertProviderUrl(baseUrl: string, hostedRuntime: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new OllamaRequestError("CONFIGURATION_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new OllamaRequestError("CONFIGURATION_INVALID");
  }
  if (
    hostedRuntime &&
    ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname.toLowerCase())
  ) {
    throw new OllamaRequestError("CONFIGURATION_INVALID");
  }
}

export function getOllamaConfig() {
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  const configuredBaseUrl = process.env.OLLAMA_BASE_URL?.trim();
  const hostedRuntime = Boolean(process.env.VERCEL || process.env.CI);
  const baseUrl =
    configuredBaseUrl ||
    (apiKey ? "https://ollama.com" : hostedRuntime ? "" : "http://localhost:11434");
  if (!baseUrl) throw new OllamaRequestError("CONFIGURATION_MISSING");
  assertProviderUrl(baseUrl, hostedRuntime);
  const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2";
  if (!model || model.length > 160) throw new OllamaRequestError("CONFIGURATION_INVALID");
  return {
    baseUrl,
    apiKey,
    model,
    generateUrl: ollamaGenerateUrl(baseUrl),
    tagsUrl: ollamaTagsUrl(baseUrl),
  };
}

function logProviderFailure(kind: OllamaFailureKind, status: number, model: string, context: string) {
  // Intentionally omit provider URLs, response bodies, prompts, keys, and user data.
  console.error("PRAXIZ AI provider failure", { kind, status, model, context });
}

function classifyProviderFailure(status: number, detail: string): OllamaFailureKind {
  if (status === 401 || status === 403) return "AUTHENTICATION_FAILED";
  if (status === 404 || /model.*not found|pull model|unknown model/i.test(detail)) return "MODEL_UNAVAILABLE";
  if (status >= 500) return "PROVIDER_UNREACHABLE";
  return "INVALID_PROVIDER_RESPONSE";
}

export async function generateWithOllama(input: {
  prompt: string;
  options?: Record<string, number | string | boolean>;
  format?: "json";
  timeoutMs?: number;
  context?: string;
}) {
  const config = getOllamaConfig();
  const context = input.context ?? "unspecified";
  let response: Response;
  try {
    response = await fetch(config.generateUrl, {
      method: "POST",
      headers: ollamaHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        stream: false,
        prompt: input.prompt,
        ...(input.format ? { format: input.format } : {}),
        ...(input.options ? { options: input.options } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 55_000),
    });
  } catch (error) {
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) {
      logProviderFailure("TIMEOUT", 504, config.model, context);
      throw new OllamaRequestError("TIMEOUT");
    }
    logProviderFailure("PROVIDER_UNREACHABLE", 503, config.model, context);
    throw new OllamaRequestError("PROVIDER_UNREACHABLE");
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    const kind = classifyProviderFailure(response.status, detail);
    logProviderFailure(kind, response.status, config.model, context);
    throw new OllamaRequestError(kind);
  }

  let result: { response?: unknown };
  try {
    result = (await response.json()) as { response?: unknown };
  } catch {
    logProviderFailure("INVALID_PROVIDER_RESPONSE", response.status, config.model, context);
    throw new OllamaRequestError("INVALID_PROVIDER_RESPONSE");
  }
  const text = typeof result.response === "string" ? result.response.trim() : "";
  if (!text) {
    logProviderFailure("INVALID_PROVIDER_RESPONSE", response.status, config.model, context);
    throw new OllamaRequestError("INVALID_PROVIDER_RESPONSE");
  }
  return { response: text, model: config.model };
}

export function ollamaErrorResponse(error: unknown) {
  const normalized = error instanceof OllamaRequestError
    ? error
    : new OllamaRequestError("INTERNAL_ERROR");
  return {
    status: normalized.status,
    body: {
      error: normalized.message,
      kind: normalized.kind,
      retryable: [
        "PROVIDER_UNREACHABLE",
        "TIMEOUT",
        "INVALID_PROVIDER_RESPONSE",
        "MODEL_OUTPUT_INVALID",
      ].includes(normalized.kind),
    },
  };
}
