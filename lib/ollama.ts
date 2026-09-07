export function ollamaGenerateUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return normalized.endsWith("/api")
    ? `${normalized}/generate`
    : `${normalized}/api/generate`;
}

export function ollamaHeaders(apiKey?: string) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(apiKey?.trim()
      ? { Authorization: `Bearer ${apiKey.trim()}` }
      : {}),
  };
}
