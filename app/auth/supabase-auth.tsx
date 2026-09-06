"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import Image from "next/image";
import { createClient } from "../../lib/supabase/client";
import { getSiteOrigin } from "../../lib/site-url";
import type { AuthUser, RoleId } from "../types";
import { mapStudentIdentity, requiresStudentProfile, resolveRoleCode } from "./student-stabilization";

const databaseRoleToUiRole: Record<string, RoleId> = {
  student_intern: "student",
  hte_supervisor: "hte",
  internship_coordinator: "coordinator",
  system_admin: "admin",
};

const registrationRole: Record<RoleId, string> = {
  student: "student_intern",
  hte: "hte_supervisor",
  coordinator: "internship_coordinator",
  admin: "system_admin",
};

export type RegistrationInput = {
  role: RoleId;
  email: string;
  password: string;
  fullName: string;
  fields: Record<string, string>;
};

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  register: (input: RegistrationInput) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authRedirectUrl(path: string) {
  const siteUrl = getSiteOrigin(window.location.origin);
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function clearRecoveryCredentials(url: URL) {
  url.searchParams.delete("code");
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

async function restorePasswordRecoverySession(supabase: ReturnType<typeof createClient>) {
  const current = await supabase.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) return current.data.session;

  const url = new URL(window.location.href);
  const queryCode = url.searchParams.get("code");
  if (queryCode) {
    const result = await supabase.auth.exchangeCodeForSession(queryCode);
    if (result.error) throw result.error;
    if (result.data.session) {
      clearRecoveryCredentials(url);
      return result.data.session;
    }
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const result = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (result.error) throw result.error;
    if (result.data.session) {
      clearRecoveryCredentials(url);
      return result.data.session;
    }
  }

  const tokenHash = url.searchParams.get("token_hash") ?? hash.get("token_hash");
  const recoveryType = url.searchParams.get("type") ?? hash.get("type");
  if (tokenHash && recoveryType === "recovery") {
    const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (result.error) throw result.error;
    if (result.data.session) {
      clearRecoveryCredentials(url);
      return result.data.session;
    }
  }

  return null;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

function logSupabaseError(operation: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error(`Supabase ${operation} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

async function resolveAuthUser(authUser: User): Promise<AuthUser> {
  const supabase = createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,first_name,middle_name,last_name,preferred_name,phone,avatar_path,account_status,metadata")
    .eq("id", authUser.id)
    .single();

  if (profileError || !profile) {
    if (profileError) logSupabaseError("profile query", profileError);
    throw new Error("Your PRAXIZ profile could not be loaded. Please contact the system administrator.");
  }

  if (profile.account_status !== "active") {
    throw new Error("Your registration is still awaiting administrator approval.");
  }

  const { data: assignments, error: roleError } = await supabase
    .from("role_assignments")
    .select("role_id,scope_org_unit_id,scope_academic_program_id,starts_at,ends_at,deleted_at")
    .eq("user_id", authUser.id)
    .is("deleted_at", null)
    .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

  if (roleError) {
    logSupabaseError("role assignment query", roleError);
    throw new Error("Your assigned PRAXIZ role could not be verified.");
  }

  type RoleAssignmentRow = {
    role_id: string;
    starts_at: string | null;
    ends_at: string | null;
    deleted_at: string | null;
    scope_org_unit_id: string | null;
    scope_academic_program_id: string | null;
  };
  const assignmentRows = (assignments ?? []) as RoleAssignmentRow[];
  const roleIds = [...new Set(assignmentRows.map((assignment) => assignment.role_id))];
  const { data: roleRows, error: rolesError } = roleIds.length
    ? await supabase.from("roles").select("id,code").in("id", roleIds).eq("is_active", true)
    : { data: [], error: null };

  if (rolesError) {
    logSupabaseError("role catalog query", rolesError);
    throw new Error("Your assigned PRAXIZ role could not be verified.");
  }

  const roleCodeById = new Map(
    ((roleRows ?? []) as { id: string; code: string }[]).map((roleRow) => [roleRow.id, roleRow.code]),
  );

  const roleAssignments = assignmentRows.flatMap((assignment) => {
    const code = roleCodeById.get(assignment.role_id);
    return code ? [{
      code,
      startsAt: assignment.starts_at,
      endsAt: assignment.ends_at,
      deletedAt: assignment.deleted_at,
      scopeOrgUnitId: assignment.scope_org_unit_id,
      scopeAcademicProgramId: assignment.scope_academic_program_id,
    }] : [];
  });
  const roleCodes = roleAssignments.map((assignment) => assignment.code);
  const primaryRole = typeof profile.metadata === "object" && profile.metadata
    ? (profile.metadata as { primary_role?: unknown }).primary_role
    : null;
  const selectedCode = resolveRoleCode(roleAssignments, primaryRole);
  const selectedRoleAssignment = roleAssignments.find((assignment) => assignment.code === selectedCode);
  const role = selectedCode ? databaseRoleToUiRole[selectedCode] : undefined;
  const availableRoles = roleCodes
    .map((code) => databaseRoleToUiRole[code])
    .filter((item): item is RoleId => Boolean(item));

  if (!role) throw new Error("Your account is active but has no PRAXIZ workspace role yet.");

  type AcademicProgramReference = {
    code: string;
    name: string;
    owning_org_unit_id: string;
  };
  type StudentProfile = {
    student_number: string;
    year_level: number;
    section: string | null;
    expected_graduation_year: number | null;
    academic_programs?: AcademicProgramReference | AcademicProgramReference[] | null;
  };
  let studentProfile: StudentProfile | null = null;
  if (requiresStudentProfile(selectedCode)) {
    const { data: studentProfileData, error: studentProfileError } = await supabase
      .from("student_profiles")
      .select("student_number,year_level,section,expected_graduation_year,academic_programs(code,name,owning_org_unit_id)")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (studentProfileError) {
      logSupabaseError("student profile query", studentProfileError);
      throw new Error("Your student profile could not be loaded. Please contact the system administrator.");
    }
    if (!studentProfileData) {
      throw new Error("Your student profile is missing. Please contact the system administrator.");
    }
    studentProfile = studentProfileData as StudentProfile | null;
  }
  const programValue = studentProfile?.academic_programs;
  let program = Array.isArray(programValue) ? programValue[0] : programValue;
  if (selectedCode === "internship_coordinator" && selectedRoleAssignment?.scopeAcademicProgramId) {
    const { data: scopedProgram, error: scopedProgramError } = await supabase
      .from("academic_programs")
      .select("code,name,owning_org_unit_id")
      .eq("id", selectedRoleAssignment.scopeAcademicProgramId)
      .maybeSingle();
    if (scopedProgramError) {
      logSupabaseError("coordinator program scope query", scopedProgramError);
      throw new Error("Your coordinator program scope could not be loaded. Please contact the system administrator.");
    }
    if (!scopedProgram) {
      throw new Error("Your coordinator role is missing its academic program. Please contact the system administrator.");
    }
    program = scopedProgram as AcademicProgramReference;
  }
  let college: string | null = null;
  let campus: string | null = null;
  let unitId = program?.owning_org_unit_id ?? null;
  for (let depth = 0; unitId && depth < 4; depth += 1) {
    const { data: unit, error: unitError } = await supabase
      .from("org_units")
      .select("unit_type,name,short_name,parent_id")
      .eq("id", unitId)
      .maybeSingle();
    if (unitError) {
      logSupabaseError("organization scope lookup", unitError);
      break;
    }
    if (!unit) break;
    if (unit.unit_type === "college") college = unit.short_name ?? unit.name;
    if (unit.unit_type === "campus") {
      campus = unit.short_name ?? unit.name;
      break;
    }
    unitId = unit.parent_id;
  }

  const fullName = profile.preferred_name?.trim()
    || [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ").trim()
    || profile.email;

  const institutionalIdentity = mapStudentIdentity({
    studentNumber: studentProfile?.student_number ?? null,
    yearLevel: studentProfile?.year_level ?? null,
    section: studentProfile?.section ?? null,
    expectedGraduationYear: studentProfile?.expected_graduation_year ?? null,
    academicProgramCode: program?.code ?? null,
    academicProgramName: program?.name ?? null,
    college,
    campus,
  });

  return {
    id: profile.id,
    email: profile.email,
    fullName,
    preferredName: profile.preferred_name ?? undefined,
    phone: profile.phone ?? undefined,
    avatarPath: profile.avatar_path ?? undefined,
    ...institutionalIdentity,
    scopeProgramId: selectedRoleAssignment?.scopeAcademicProgramId ?? undefined,
    scopeProgramCode: selectedCode === "internship_coordinator" ? program?.code : undefined,
    scopeProgramName: selectedCode === "internship_coordinator" ? program?.name : undefined,
    scopeOrgUnitId: selectedRoleAssignment?.scopeOrgUnitId ?? undefined,
    role,
    roles: availableRoles,
    accountStatus: "active",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function hydrate(authUser: User | null) {
      if (!authUser) {
        if (active) setUser(null);
        return;
      }
      try {
        const account = await resolveAuthUser(authUser);
        if (active) setUser(account);
      } catch {
        if (active) setUser(null);
      }
    }

    void supabase.auth.getUser().then((result: { data: { user: User | null } }) => hydrate(result.data.user)).finally(() => {
      if (active) setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      window.setTimeout(() => {
        void hydrate(session?.user ?? null).finally(() => {
          if (active) setReady(true);
        });
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    ready,
    async refreshProfile() {
      const { data, error } = await createClient().auth.getUser();
      if (error || !data.user) throw new Error('Please sign in again.');
      setUser(await resolveAuthUser(data.user));
    },
    async signIn(email, password) {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user) throw new Error(error?.message ?? "The email or password is incorrect.");
      try {
        const account = await resolveAuthUser(data.user);
        setUser(account);
        return account;
      } catch (error) {
        await supabase.auth.signOut();
        throw error;
      }
    },
    async signOut() {
      const { error } = await createClient().auth.signOut();
      setUser(null);
      if (error) throw new Error(error.message);
    },
    async register(input) {
      const supabase = createClient();
      const names = splitName(input.fullName);
      const metadata = {
        ...input.fields,
        requested_role: registrationRole[input.role],
        first_name: names.firstName,
        middle_name: names.middleName,
        last_name: names.lastName,
      };
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          emailRedirectTo: authRedirectUrl("/signin"),
          data: metadata,
        },
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Supabase did not create the registration account.");
      if (data.session) await supabase.auth.signOut();
      setUser(null);
    },
    async requestPasswordReset(email) {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: authRedirectUrl("/reset-password"),
      });
      if (error) throw new Error(error.message);
    },
    async updatePassword(password) {
      const supabase = createClient();
      let session = null;
      try {
        session = await restorePasswordRecoverySession(supabase);
      } catch {
        throw new Error("This password-reset link is invalid or has expired. Request a new link and try again.");
      }
      if (!session) {
        throw new Error("This password-reset link is invalid or has expired. Request a new link and try again.");
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
  }), [ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function ProtectedRoute({ role, children }: { role: RoleId; children: ReactNode }) {
  const { ready, user } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) window.location.replace(`/signin?returnTo=/${role}/dashboard`);
    else if (!user.roles.includes(role)) window.location.replace(`/${user.role}/dashboard`);
  }, [ready, role, user]);

  if (!ready || !user || !user.roles.includes(role)) {
    return <main className="route-loading" role="status" aria-live="polite" aria-busy="true"><div className="workspace-loading-content"><span className="loading-wordmark"><Image unoptimized src="/branding/praxiz-logo.png" alt="PRAXIZ" width={360} height={360} priority /></span><h1>Preparing your workspace</h1><span className="route-loading-mark" aria-hidden="true"><span /></span><p>Loading your authorized internship tools and verified PRAXIZ data.</p><span className="loading-institution">Partido State University</span></div></main>;
  }
  return children;
}
