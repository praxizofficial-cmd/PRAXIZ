/** Preserve Unicode and compound names while storing the existing full_name value. */
export function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
export function validNamePart(value: string): boolean {
  return /\p{L}/u.test(value) && /^[\p{L}\p{M} '\u2019.-]+$/u.test(normalizeName(value));
}
export function validMiddleInitial(value: string): boolean {
  return !value.trim() || /^\p{L}\p{M}*\.?$/u.test(value.trim().normalize("NFC"));
}
export function formatRegistrationName(first: string, middle: string, last: string, suffix = ""): string {
  const initial = middle.trim().normalize("NFC").replace(/\.$/, "").toLocaleUpperCase();
  return [normalizeName(first), initial ? `${initial}.` : "", normalizeName(last), normalizeName(suffix)].filter(Boolean).join(" ");
}
