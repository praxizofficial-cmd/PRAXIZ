import assert from "node:assert/strict";
import test from "node:test";

import {
  mimeTypesForPreset,
  normalizeDocumentTemplateCode,
  validateDocumentTemplate,
} from "../app/services/workflow-template-stabilization.ts";

test("template codes are normalized to database-safe slugs", () => {
  assert.equal(normalizeDocumentTemplateCode("  Weekly Accomplishment Report  "), "weekly-accomplishment-report");
  assert.equal(normalizeDocumentTemplateCode("MOA_v2"), "moa-v2");
});

test("file type presets never omit PDF", () => {
  assert.deepEqual(mimeTypesForPreset("pdf"), ["application/pdf"]);
  assert.deepEqual(mimeTypesForPreset("pdf_images"), ["application/pdf", "image/jpeg", "image/png"]);
});

test("document template validation enforces database limits", () => {
  assert.equal(validateDocumentTemplate({ code: "dtr", name: "Daily Time Record", maxFileSizeMb: 20, displayOrder: 10 }), null);
  assert.match(validateDocumentTemplate({ code: "", name: "Daily Time Record", maxFileSizeMb: 20, displayOrder: 10 }) ?? "", /code/i);
  assert.match(validateDocumentTemplate({ code: "dtr", name: "Daily Time Record", maxFileSizeMb: 21, displayOrder: 10 }) ?? "", /1 to 20 MB/i);
  assert.match(validateDocumentTemplate({ code: "dtr", name: "Daily Time Record", maxFileSizeMb: 20, displayOrder: -1 }) ?? "", /display order/i);
});
