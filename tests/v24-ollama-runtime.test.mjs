import assert from "node:assert/strict";
import test from "node:test";
import {
  generateWithOllama,
  getOllamaConfig,
  OllamaRequestError,
} from "../lib/ollama.ts";

const original = {
  fetch: globalThis.fetch,
  baseUrl: process.env.OLLAMA_BASE_URL,
  apiKey: process.env.OLLAMA_API_KEY,
  model: process.env.OLLAMA_MODEL,
  vercel: process.env.VERCEL,
  ci: process.env.CI,
};

function restore() {
  globalThis.fetch = original.fetch;
  for (const [name, value] of [
    ["OLLAMA_BASE_URL", original.baseUrl],
    ["OLLAMA_API_KEY", original.apiKey],
    ["OLLAMA_MODEL", original.model],
    ["VERCEL", original.vercel],
    ["CI", original.ci],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function expectKind(error, kind) {
  assert.ok(error instanceof OllamaRequestError);
  assert.equal(error.kind, kind);
  return true;
}

test("Ollama runtime handles configuration, provider, model, timeout, malformed, and success paths", async (t) => {
  t.after(restore);
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_API_KEY;
  process.env.VERCEL = "1";
  assert.throws(() => getOllamaConfig(), (error) => expectKind(error, "CONFIGURATION_MISSING"));

  process.env.OLLAMA_BASE_URL = "file:///not-an-http-provider";
  assert.throws(() => getOllamaConfig(), (error) => expectKind(error, "CONFIGURATION_INVALID"));

  process.env.OLLAMA_BASE_URL = "https://provider.example.test";
  process.env.OLLAMA_MODEL = "configured-model";

  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(generateWithOllama({ prompt: "hello", context: "test" }), (error) => expectKind(error, "PROVIDER_UNREACHABLE"));

  globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
  await assert.rejects(generateWithOllama({ prompt: "hello", context: "test" }), (error) => expectKind(error, "AUTHENTICATION_FAILED"));

  globalThis.fetch = async () => new Response("model not found", { status: 404 });
  await assert.rejects(generateWithOllama({ prompt: "hello", context: "test" }), (error) => expectKind(error, "MODEL_UNAVAILABLE"));

  globalThis.fetch = async () => { throw new DOMException("timed out", "TimeoutError"); };
  await assert.rejects(generateWithOllama({ prompt: "hello", context: "test" }), (error) => expectKind(error, "TIMEOUT"));

  globalThis.fetch = async () => new Response("not-json", { status: 200 });
  await assert.rejects(generateWithOllama({ prompt: "hello", context: "test" }), (error) => expectKind(error, "INVALID_PROVIDER_RESPONSE"));

  let sentBody = null;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return Response.json({ response: "Real provider response" });
  };
  const result = await generateWithOllama({ prompt: "hello", format: "json", context: "test" });
  assert.deepEqual(result, { response: "Real provider response", model: "configured-model" });
  assert.equal(sentBody.model, "configured-model");
  assert.equal(sentBody.format, "json");
});
