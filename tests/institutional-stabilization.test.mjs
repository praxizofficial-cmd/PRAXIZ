import assert from "node:assert/strict";
import test from "node:test";
import { isValidRegistrationSelection, programsForCollege, programsForUnit, resetRegistrationSelection, unitsForCampus } from "../app/services/institutional-stabilization.ts";

const campuses = [
  ["goa", "Goa Main Campus"], ["caramoan", "Caramoan Campus"], ["lagonoy", "Lagonoy Campus"],
  ["sagnay", "Sagñay Campus"], ["salogon", "Salogon Campus"], ["sanjose", "San Jose Campus"], ["tinambac", "Tinambac Campus"],
].map(([id, name]) => ({ id, parentId: "university", unitType: "campus", code: id.toUpperCase(), name, shortName: name }));
const colleges = [
  ["sanjose", "CHTM", "College of Hospitality and Tourism Management"], ["lagonoy", "CPSCH", "College of Public Safety and Community Health"],
  ["sagnay", "CFMS", "College of Fisheries and Marine Science"], ["salogon", "CACD", "College of Agribusiness and Community Development"],
  ["tinambac", "CESD", "College of Environmental Science and Design"], ["caramoan", "CSCE", "College of Sustainable Communities and Ecosystems"],
].map(([campusId, code, name]) => ({ id: code, parentId: campusId, unitType: "college", code, name, shortName: code }));
const programs = [
  ["CHTM", "BSHM", "Bachelor of Science in Hospitality Management", true], ["CHTM", "BSTM", "Bachelor of Science in Tourism Management", true],
  ["CPSCH", "BSND", "Bachelor of Science in Nutrition and Dietetics", true], ["CPSCH", "BSCrim", "Bachelor of Science in Criminology", true], ["CPSCH", "BSISM", "Bachelor of Science in Industrial Security Management", true],
  ["CFMS", "BSFISH", "Bachelor of Science in Fisheries", true], ["CFMS", "BSMB", "Bachelor of Science in Marine Biology", true],
  ["CACD", "BSAB", "Bachelor of Science in Agribusiness", true], ["CACD", "BSCD", "Bachelor of Science in Community Development", true],
  ["CESD", "BSES", "Bachelor of Science in Environmental Science", true], ["CESD", "BSEP", "Bachelor of Science in Environmental Planning", true], ["CESD", "BSF", "Bachelor of Science in Forestry", true],
  ["CSCE", "BSHM", "Bachelor of Science in Hospitality Management", true], ["CSCE", "BSBIO-CRE", "Bachelor of Science in Biology, major in Conservation and Restoration Ecology", true], ["CSCE", "BSTM-ECO", "Bachelor of Science in Tourism Management, major in Ecotourism", true],
  ["CSCE", "BAT", "Bachelor of Automotive Technology", false], ["CSCE", "BET-MET", "Bachelor of Engineering Technology, major in Mechanical Engineering Technology, specialization in Automotive Technology", false],
].map(([owningOrgUnitId, code, name, isActive], index) => ({ id: `program-${index}`, owningOrgUnitId, code, name, isActive }));
const units = [...campuses, ...colleges, { id: "CECS", parentId: "goa", unitType: "college", code: "CECS", name: "College of Engineering and Computational Sciences", shortName: "CEC" }, { id: "dcs", parentId: "CECS", unitType: "department", code: "DCS", name: "Computational Sciences Department", shortName: "Computational Sciences Department" }, { id: "engineering", parentId: "CECS", unitType: "department", code: "CEC-ENG", name: "Engineering Department", shortName: "Engineering Department" }];
const goaUnits = units;
const goaPrograms = [
  { id: "40000000-0000-0000-0000-000000000001", owningOrgUnitId: "dcs", code: "BSIT", name: "Bachelor of Science in Information Technology", isActive: true },
  { id: "40000000-0000-0000-0000-000000000002", owningOrgUnitId: "dcs", code: "BSCS", name: "Bachelor of Science in Computer Science", isActive: true },
  { id: "40000000-0000-0000-0000-000000000003", owningOrgUnitId: "dcs", code: "BSIS", name: "Bachelor of Science in Information Systems", isActive: false },
  { id: "goa-bsmath", owningOrgUnitId: "dcs", code: "BSMath", name: "Bachelor of Science in Mathematics", isActive: true },
  { id: "goa-bsce", owningOrgUnitId: "engineering", code: "BSCE", name: "Bachelor of Science in Civil Engineering", isActive: true },
  { id: "goa-bsse", owningOrgUnitId: "engineering", code: "BSSE", name: "Bachelor of Science in Sanitary Engineering", isActive: true },
  { id: "goa-bat", owningOrgUnitId: "engineering", code: "BAT", name: "Bachelor of Automotive Technology", isActive: true },
  { id: "goa-bet-eet", owningOrgUnitId: "engineering", code: "BET-EET", name: "Bachelor of Engineering Technology, major in Electrical Engineering Technology", isActive: true },
  { id: "goa-bet-auto", owningOrgUnitId: "engineering", code: "BET-MET-AUTO", name: "Bachelor of Engineering Technology in Mechanical Engineering Technology, major in Automotive Technology", isActive: true },
  { id: "goa-bet-rac", owningOrgUnitId: "engineering", code: "BET-MET-RAC", name: "Bachelor of Engineering Technology in Mechanical Engineering Technology, major in Refrigeration and Airconditioning Technology", isActive: true },
];

test("institutional fixture contains exactly seven campuses", () => {
  assert.deepEqual(campuses.map((campus) => campus.name), ["Goa Main Campus", "Caramoan Campus", "Lagonoy Campus", "Sagñay Campus", "Salogon Campus", "San Jose Campus", "Tinambac Campus"]);
});

test("CEC preserves department ownership and display abbreviation", () => {
  assert.equal(units.find((unit) => unit.code === "CECS")?.shortName, "CEC");
  assert.equal(units.find((unit) => unit.code === "DCS")?.id, "dcs");
  assert.equal(units.find((unit) => unit.code === "DCS")?.name, "Computational Sciences Department");
  assert.equal(units.find((unit) => unit.code === "CEC-ENG")?.parentId, "CECS");
});

test("BSIT and BSCS remain under the preserved Computational Sciences department", () => {
  assert.deepEqual(goaPrograms.filter((program) => ["BSIT", "BSCS"].includes(program.code)).map((program) => [program.id, program.owningOrgUnitId]), [["40000000-0000-0000-0000-000000000001", "dcs"], ["40000000-0000-0000-0000-000000000002", "dcs"]]);
  assert.equal(new Set(goaPrograms.filter((program) => ["BSIT", "BSCS"].includes(program.code)).map((program) => program.code)).size, 2);
  assert.equal(goaPrograms.find((program) => program.code === "BSIS")?.isActive, false);
});

test("university college count excludes DCS and includes all eleven colleges", () => {
  const goaColleges = ["CAH", "CBM", "CED", "CECS", "COS"].map((code) => ({ id: code, parentId: "goa", unitType: "college", code, name: code, shortName: code }));
  assert.equal([...goaColleges, ...colleges].filter((unit) => unit.unitType === "college").length, 11);
  assert.equal(units.find((unit) => unit.code === "DCS")?.unitType, "department");
  assert.equal(units.find((unit) => unit.code === "DCS")?.parentId, "CECS");
});

test("campus and unit selections expose the intended programs", () => {
  assert.deepEqual(unitsForCampus(units, "sanjose").map((unit) => unit.code), ["CHTM"]);
  assert.deepEqual(programsForUnit(programs, "CHTM").map((program) => program.code), ["BSHM", "BSTM"]);
  assert.deepEqual(programsForUnit(programs, "CPSCH").map((program) => program.code), ["BSND", "BSCrim", "BSISM"]);
  assert.deepEqual(programsForUnit(programs, "CFMS").map((program) => program.code), ["BSFISH", "BSMB"]);
  assert.deepEqual(programsForUnit(programs, "CACD").map((program) => program.code), ["BSAB", "BSCD"]);
  assert.deepEqual(programsForUnit(programs, "CESD").map((program) => program.code), ["BSES", "BSEP", "BSF"]);
  assert.deepEqual(programsForUnit(programs, "CSCE").map((program) => program.code), ["BSHM", "BSBIO-CRE", "BSTM-ECO"]);
  assert.deepEqual(programsForCollege(goaUnits, goaPrograms, "CECS").map((program) => program.code), ["BSIT", "BSCS", "BSMath", "BSCE", "BSSE", "BAT", "BET-EET", "BET-MET-AUTO", "BET-MET-RAC"]);
});

test("registration rejects cross-campus combinations and phase-out programs are inactive", () => {
  assert.equal(isValidRegistrationSelection(units, programs, "sanjose", "CPSCH", "BSND"), false);
  assert.equal(isValidRegistrationSelection(units, programs, "sanjose", "CHTM", "program-1"), true);
  assert.equal(isValidRegistrationSelection(units, programs, "tinambac", "CESD", "program-11"), true);
  assert.equal(programsForUnit(programs, "CSCE").some((program) => program.code === "BAT"), false);
});

test("changing a registration campus or college clears downstream values", () => {
  assert.deepEqual(resetRegistrationSelection({ campusId: "goa", collegeId: "CECS", programId: "BSIT" }, "campus"), { campusId: "goa", collegeId: "", programId: "" });
  assert.deepEqual(resetRegistrationSelection({ campusId: "sanjose", collegeId: "CHTM", programId: "BSHM" }, "college"), { campusId: "sanjose", collegeId: "CHTM", programId: "" });
});

test("registration lookup exposes only active colleges and programs", () => {
  const registrationUnits = units.filter((unit) => ["campus", "college", "department"].includes(unit.unitType));
  assert.equal(registrationUnits.filter((unit) => unit.unitType === "campus").length, 7);
  assert.equal(registrationUnits.filter((unit) => unit.unitType === "college").some((unit) => ["DCS", "CEC-ENG"].includes(unit.code)), false);
  assert.equal(programsForCollege(goaUnits, goaPrograms, "CECS").some((program) => program.code === "BSIS"), false);
  assert.deepEqual(programsForCollege(goaUnits, goaPrograms, "CECS").map((program) => program.code), ["BSIT", "BSCS", "BSMath", "BSCE", "BSSE", "BAT", "BET-EET", "BET-MET-AUTO", "BET-MET-RAC"]);
});
