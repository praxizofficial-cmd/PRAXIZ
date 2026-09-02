import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PRAXIZ landing page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /PRAXIZ/);
  assert.match(html, /Internship Monitoring Platform/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders public and role-based routes", async () => {
  for (const pathname of ["/signin", "/forgot-password", "/reset-password", "/register", "/student/dashboard", "/hte/dashboard", "/coordinator/dashboard", "/admin/dashboard"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /PRAXIZ/, pathname);
  }
});

test("includes accessible interactive controls and social metadata", async () => {
  const response = await render("/signin");
  const html = await response.text();
  assert.match(html, /aria-label=/i);
  assert.match(html, /og\.png/i);
  assert.match(html, /Sign in/i);
});
