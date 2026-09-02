export type InstitutionalUnit = {
  id: string;
  parentId: string | null;
  unitType: string;
  code: string;
  name: string;
  shortName: string | null;
};

export type InstitutionalProgram = {
  id: string;
  owningOrgUnitId: string;
  code: string;
  name: string;
  isActive: boolean;
};

export function descendantUnitIds(units: InstitutionalUnit[], unitId: string): string[] {
  const descendants = new Set<string>([unitId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const unit of units) {
      if (unit.parentId && descendants.has(unit.parentId) && !descendants.has(unit.id)) {
        descendants.add(unit.id);
        changed = true;
      }
    }
  }
  return [...descendants];
}

export function unitsForCampus(units: InstitutionalUnit[], campusId: string): InstitutionalUnit[] {
  return units.filter((unit) => unit.parentId === campusId && unit.unitType === "college");
}

export function programsForUnit(programs: InstitutionalProgram[], unitId: string): InstitutionalProgram[] {
  return programs.filter((program) => program.owningOrgUnitId === unitId && program.isActive);
}

export function programsForCollege(units: InstitutionalUnit[], programs: InstitutionalProgram[], collegeId: string): InstitutionalProgram[] {
  const unitIds = new Set(descendantUnitIds(units, collegeId));
  return programs.filter((program) => unitIds.has(program.owningOrgUnitId) && program.isActive);
}

export function isValidRegistrationSelection(
  units: InstitutionalUnit[],
  programs: InstitutionalProgram[],
  campusId: string,
  collegeId: string,
  programId: string | null,
): boolean {
  const campus = units.find((unit) => unit.id === campusId && unit.unitType === "campus");
  const college = units.find((unit) => unit.id === collegeId && unit.parentId === campusId && unit.unitType === "college");
  const descendantIds = new Set(descendantUnitIds(units, collegeId));
  const program = programId ? programs.find((item) => item.id === programId && descendantIds.has(item.owningOrgUnitId) && item.isActive) : null;
  return Boolean(campus && college && (!programId || program));
}

export function resetRegistrationSelection(selection: { campusId: string; collegeId: string; programId: string }, changed: "campus" | "college") {
  return changed === "campus"
    ? { campusId: selection.campusId, collegeId: "", programId: "" }
    : { ...selection, programId: "" };
}
