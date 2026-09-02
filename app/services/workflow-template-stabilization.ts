export type DocumentTemplatePhase = "pre_internship" | "during_internship" | "post_internship";

export type DocumentTemplateMimePreset = "pdf" | "pdf_images";

export function normalizeDocumentTemplateCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function mimeTypesForPreset(preset: DocumentTemplateMimePreset): string[] {
  return preset === "pdf_images"
    ? ["application/pdf", "image/jpeg", "image/png"]
    : ["application/pdf"];
}

export function validateDocumentTemplate(input: {
  code: string;
  name: string;
  maxFileSizeMb: number;
  displayOrder: number;
}): string | null {
  if (!normalizeDocumentTemplateCode(input.code)) return "Enter a valid template code.";
  if (!input.name.trim()) return "Enter the template name.";
  if (!Number.isInteger(input.maxFileSizeMb) || input.maxFileSizeMb < 1 || input.maxFileSizeMb > 20) {
    return "The maximum file size must be a whole number from 1 to 20 MB.";
  }
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
    return "The display order must be zero or a positive whole number.";
  }
  return null;
}
