import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const app = await read("../app/PraxizApp.tsx");
const css = await read("../app/globals.css");

const pageStart = app.indexOf("function RegistrationSuccessPage");
const pageEnd = app.indexOf("function PageHeader", pageStart);
const page = app.slice(pageStart, pageEnd);

test("registration status reads browser storage only after hydration", () => {
  assert.match(page, /useState<string \| null>\(null\)/);
  assert.match(page, /useEffect\(\(\) => \{[\s\S]*sessionStorage\.getItem/);
  assert.match(page, /setRegisteredEmail\(email\);[\s\S]*\}, \[\]\)/);
  assert.match(page, /if \(registeredEmail === null\)/);
  assert.match(page, /Checking registration status/);
  assert.doesNotMatch(page, /typeof window/);
});

test("registration success remains gated by the confirmed submission proof", () => {
  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.match(page, /sessionStorage\.getItem\("praxiz-registration-submission"\)/);
  assert.match(page, /if \(!registeredEmail\)/);
  assert.ok(
    page.indexOf("if (!registeredEmail)") < page.indexOf("Registration submitted"),
    "the honest missing-submission state must run before the success UI",
  );
});

test("registration success renders the approved three-step guidance", () => {
  assert.match(page, />01<\/span>/);
  assert.match(page, />02<\/span>/);
  assert.match(page, />03<\/span>/);
  assert.match(page, /Verify your email address/);
  assert.match(page, /Open the verification message sent to your institutional/);
  assert.match(page, /Your registration remains pending until an authorized/);
  assert.match(page, /Use your institutional email address and password after/);
  assert.match(page, /className="registration-success-email"/);
  assert.match(page, /href="\/signin"/);
  assert.match(page, /href="\/"/);
});

test("registration success uses a centered, wrapping, responsive grid", () => {
  assert.match(
    css,
    /\.registration-success-page main\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;[\s\S]*?box-sizing:\s*border-box;/,
  );
  assert.doesNotMatch(
    css,
    /\.registration-success-page main\s*\{[^}]*width:\s*min\(100%\s*-\s*32px,\s*620px\)/,
  );
  assert.match(css, /\.registration-success-card\s*\{[^}]*width:\s*min\(860px,\s*100%\)/);
  assert.match(
    css,
    /\.registration-success-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(css, /\.registration-success-steps li\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*?\.registration-success-steps,[\s\S]*?grid-template-columns:\s*1fr/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*390px\)[\s\S]*?\.registration-success-actions[\s\S]*?width:\s*100%/,
  );
});
