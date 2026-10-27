import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app/PraxizApp.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("v27 sidebar is explicitly collapsible, persistent, accessible, and shared by every role", () => {
  assert.match(app, /praxiz-sidebar-expanded/);
  assert.match(app, /aria-label=\{expanded \? "Collapse sidebar" : "Expand sidebar"\}/);
  assert.match(app, /aria-pressed=\{expanded\}/);
  assert.match(app, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(app, /title=\{item\.label\}/);
  assert.match(app, /event\.key === "Tab" && mobileNav/);
  assert.match(app, /<AppShell role=\{role\} page=\{page\}>/);
  assert.match(css, /\.sidebar-expanded/);
  assert.match(css, /\.app-shell-sidebar-expanded/);
});

test("v27 mobile notifications and AI action retain separated responsive surfaces", () => {
  assert.match(app, /title="Notifications"/);
  assert.match(app, /filter === "unread"/);
  assert.match(app, /markAllRead/);
  assert.match(css, /\.ai-assistant-trigger/);
  assert.match(css, /\.notification/);
  assert.match(css, /@media \(max-width:/);
});
