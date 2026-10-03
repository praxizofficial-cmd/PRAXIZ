export const STUDENT_YEAR_LEVEL_OPTIONS = [1, 2, 3, 4] as const;

export const STUDENT_SECTION_OPTIONS = ["A", "B", "C", "D", "E"] as const;

export const ACADEMIC_TERM_LABELS = {
  first_semester: "1st Semester",
  second_semester: "2nd Semester",
  midyear: "Midyear",
} as const;

export type AcademicTermCode = keyof typeof ACADEMIC_TERM_LABELS;
export type AcademicTermLabel = (typeof ACADEMIC_TERM_LABELS)[AcademicTermCode];

export function academicTermLabel(term: AcademicTermCode): AcademicTermLabel;
export function academicTermLabel(term: string): string;
export function academicTermLabel(term: string): string {
  return ACADEMIC_TERM_LABELS[term as AcademicTermCode] ?? term;
}

export function mergeAcademicOptionValues<T extends string | number>(
  standard: readonly T[],
  observed: readonly T[],
): T[] {
  return [...new Set([...standard, ...observed])];
}
