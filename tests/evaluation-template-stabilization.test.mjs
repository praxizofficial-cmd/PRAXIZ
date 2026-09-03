import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEvaluationCode,
  validateEvaluationTemplate,
} from "../app/services/evaluation-template-stabilization.ts";

const validCriteria = [
  { code: "work-quality", label: "Work quality", description: "", weight: 60, minimumScore: 1, maximumScore: 5, displayOrder: 10 },
  { code: "professionalism", label: "Professionalism", description: "", weight: 40, minimumScore: 1, maximumScore: 5, displayOrder: 20 },
];

test("evaluation codes are normalized to database-safe slugs", () => {
  assert.equal(normalizeEvaluationCode(" Final HTE Review "), "final-hte-review");
  assert.equal(normalizeEvaluationCode("Work_Quality"), "work-quality");
});

test("evaluation template validation accepts a complete weighted form", () => {
  assert.equal(validateEvaluationTemplate({ code: "final-hte", name: "Final HTE Evaluation", criteria: validCriteria }), null);
});

test("evaluation template validation requires unique criteria totaling 100 percent", () => {
  assert.match(validateEvaluationTemplate({ code: "final-hte", name: "Final HTE Evaluation", criteria: validCriteria.map((criterion) => ({ ...criterion, weight: 40 })) }) ?? "", /100%/i);
  assert.match(validateEvaluationTemplate({ code: "final-hte", name: "Final HTE Evaluation", criteria: [validCriteria[0], { ...validCriteria[1], code: "work-quality" }] }) ?? "", /unique/i);
});
