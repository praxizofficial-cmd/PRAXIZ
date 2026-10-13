export type InstitutionalEmailValidation = {
  normalizedEmail: string;
  valid: boolean;
  suffix: string;
  error: string;
};

const PSU_STUDENT_EMAIL = /^([a-z0-9._%+-]*?)(\d{3})\.pbox@parsu\.edu\.ph$/i;

export function normalizeInstitutionalEmail(value: string) {
  return value.trim().toLowerCase();
}

export function studentNumberSuffix(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : "";
}

export function validateInstitutionalEmail(
  email: string,
  studentNumber: string,
): InstitutionalEmailValidation {
  const normalizedEmail = normalizeInstitutionalEmail(email);
  const match = PSU_STUDENT_EMAIL.exec(normalizedEmail);
  if (!match) {
    return {
      normalizedEmail,
      valid: false,
      suffix: "",
      error:
        "Use your PSU email ending in exactly three digits followed by .pbox@parsu.edu.ph.",
    };
  }
  const suffix = match[2];
  const expectedSuffix = studentNumberSuffix(studentNumber);
  if (!expectedSuffix) {
    return {
      normalizedEmail,
      valid: false,
      suffix,
      error: "Enter a valid Student Number before verifying the email.",
    };
  }
  if (suffix !== expectedSuffix) {
    return {
      normalizedEmail,
      valid: false,
      suffix,
      error: `The email suffix ${suffix} must match the last three digits of your Student Number (${expectedSuffix}).`,
    };
  }
  return { normalizedEmail, valid: true, suffix, error: "" };
}
