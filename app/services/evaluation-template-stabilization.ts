export type EvaluationTemplateStage = "midterm" | "final" | "other";

export type EvaluationTemplateEvaluator = "hte" | "coordinator";

export type EvaluationTemplateCriterionInput = {
  code: string;
  label: string;
  description: string;
  weight: number;
  minimumScore: number;
  maximumScore: number;
  displayOrder: number;
};

export function normalizeEvaluationCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateEvaluationTemplate(input: {
  code: string;
  name: string;
  criteria: EvaluationTemplateCriterionInput[];
}): string | null {
  if (!normalizeEvaluationCode(input.code)) return "Enter a valid template code.";
  if (!input.name.trim()) return "Enter the evaluation form name.";
  if (input.criteria.length < 1) return "Add at least one evaluation criterion.";
  if (input.criteria.length > 20) return "An evaluation form can contain up to 20 criteria.";

  const codes = new Set<string>();
  for (const [index, criterion] of input.criteria.entries()) {
    const position = index + 1;
    const code = normalizeEvaluationCode(criterion.code || criterion.label);
    if (!code) return `Enter a name for criterion ${position}.`;
    if (codes.has(code)) return "Each evaluation criterion must have a unique name.";
    codes.add(code);
    if (!criterion.label.trim()) return `Enter a name for criterion ${position}.`;
    if (!Number.isFinite(criterion.weight) || criterion.weight <= 0 || criterion.weight > 100) {
      return `Criterion ${position} must have a weight from 1% to 100%.`;
    }
    if (!Number.isFinite(criterion.minimumScore) || !Number.isFinite(criterion.maximumScore) || criterion.minimumScore < 0 || criterion.maximumScore <= criterion.minimumScore) {
      return `Criterion ${position} has an invalid score range.`;
    }
  }

  const totalWeight = input.criteria.reduce((total, criterion) => total + criterion.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.001) return `Criterion weights must total 100% (currently ${totalWeight}%).`;
  return null;
}
