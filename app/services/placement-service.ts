"use client";

import { createClient } from "../../lib/supabase/client";

function joinedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
function fullName(
  profile: {
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string;
  } | null,
) {
  return profile
    ? [profile.first_name, profile.middle_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || profile.email
    : "Assigned user";
}

export type PlacementRecord = {
  id: string;
  studentId: string;
  coordinatorId: string;
  hteId: string;
  studentName: string;
  yearLevel: number | null;
  section: string;
  campus: string;
  college: string;
  coordinator: string;
  program: string;
  hte: string;
  term: string;
  status: string;
  dailyRequiredHours: number | null;
};

export type PlacementComplianceRecord = {
  requirementId: string;
  title: string;
  description: string;
  dueAt: string;
  coordinatorId: string | null;
  coordinatorName: string;
  status: string;
  submissionId: string | null;
  version: number | null;
  feedback: string;
  submittedAt: string;
  originalName: string;
};

export type RequiredFormatRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  versionId: string | null;
  version: number | null;
  fileName: string;
  status: string;
  publishedAt: string | null;
  objectPath: string | null;
  mimeType: string | null;
  submittedBy: string;
  submittedAt: string | null;
  reviewFeedback: string;
  history: Array<{
    id: string;
    version: number;
    fileName: string;
    status: string;
    submittedBy: string;
    submittedAt: string;
    publishedAt: string | null;
  }>;
};

type ComplianceRequirementRow = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
};

async function namesFor(ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await createClient()
    .from("profiles")
    .select("id,first_name,middle_name,last_name,email")
    .in("id", [...new Set(ids)]);
  // Profile names are optional presentation enrichment. Some otherwise-
  // authorized roles cannot read every related profile, and that must not make
  // the underlying compliance or file-format records disappear.
  if (error) return map;
  for (const row of data ?? [])
    map.set(
      row.id as string,
      fullName(
        row as {
          first_name: string;
          middle_name: string | null;
          last_name: string;
          email: string;
        },
      ),
    );
  return map;
}

export const placementService = {
  async listPlacements(): Promise<PlacementRecord[]> {
    const supabase = createClient();
    const [{ data, error }, { data: units, error: unitError }] =
      await Promise.all([
        supabase
          .from("internship_assignments")
          .select(
            "id,student_user_id,campus_org_unit_id,academic_program_id,hte_id,academic_term_id,status,daily_required_hours_snapshot,student_profiles(year_level,section),academic_programs(code,name,owning_org_unit_id),hte_organizations(name,trade_name),academic_terms(term,academic_years(label)),internship_supervisors(supervisor_user_id,supervisor_type,is_primary,started_at,ended_at,deleted_at)",
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("org_units")
          .select("id,parent_id,unit_type,name,short_name")
          .is("deleted_at", null),
      ]);
    if (error) throw new Error(error.message);
    if (unitError) throw new Error(unitError.message);
    type Unit = {
      id: string;
      parent_id: string | null;
      unit_type: string;
      name: string;
      short_name: string | null;
    };
    const byId = new Map(
      ((units ?? []) as Unit[]).map((unit) => [unit.id, unit]),
    );
    const rows = (data ?? []) as unknown as Array<
      Record<string, unknown> & {
        id: string;
        student_user_id: string;
        campus_org_unit_id: string;
        status: string;
        daily_required_hours_snapshot: number | string | null;
        internship_supervisors?: Array<{
          supervisor_user_id: string;
          supervisor_type: string;
          is_primary: boolean;
          started_at: string;
          ended_at: string | null;
          deleted_at: string | null;
        }> | null;
      }
    >;
    const now = Date.now();
    const coordinatorFor = (row: (typeof rows)[number]) =>
      [...(row.internship_supervisors ?? [])]
        .filter(
          (supervisor) =>
            supervisor.supervisor_type === "coordinator" &&
            !supervisor.deleted_at &&
            Date.parse(supervisor.started_at) <= now &&
            (!supervisor.ended_at || Date.parse(supervisor.ended_at) > now),
        )
        .sort((left, right) => Number(right.is_primary) - Number(left.is_primary))[0]
        ?.supervisor_user_id ?? "";
    const names = await namesFor(
      rows
        .flatMap((row) => [row.student_user_id, coordinatorFor(row)])
        .filter(Boolean),
    );
    return rows.map((row) => {
      const coordinatorId = coordinatorFor(row);
      const program = joinedOne(
        row.academic_programs as
          | { code: string; name: string; owning_org_unit_id: string }
          | Array<{ code: string; name: string; owning_org_unit_id: string }>
          | null,
      );
      const profile = joinedOne(
        row.student_profiles as
          | { year_level: number | null; section: string | null }
          | Array<{ year_level: number | null; section: string | null }>
          | null,
      );
      const hte = joinedOne(
        row.hte_organizations as
          | { name: string; trade_name: string | null }
          | Array<{ name: string; trade_name: string | null }>
          | null,
      );
      const term = joinedOne(
        row.academic_terms as
          | {
              term: string;
              academic_years?:
                { label: string } | Array<{ label: string }> | null;
            }
          | Array<{
              term: string;
              academic_years?:
                { label: string } | Array<{ label: string }> | null;
            }>
          | null,
      );
      let unit = program ? byId.get(program.owning_org_unit_id) : null;
      let college = "";
      let campus = "";
      for (let depth = 0; unit && depth < 8; depth += 1) {
        if (unit.unit_type === "college")
          college = unit.short_name || unit.name;
        if (unit.unit_type === "campus") {
          campus = unit.short_name || unit.name;
          break;
        }
        unit = unit.parent_id ? byId.get(unit.parent_id) : undefined;
      }
      const year = joinedOne(term?.academic_years);
      return {
        id: row.id,
        studentId: row.student_user_id,
        coordinatorId,
        hteId: String(row.hte_id),
        studentName: names.get(row.student_user_id) || "Assigned intern",
        yearLevel: profile?.year_level ?? null,
        section: profile?.section ?? "Not recorded",
        campus:
          campus ||
          byId.get(row.campus_org_unit_id)?.short_name ||
          byId.get(row.campus_org_unit_id)?.name ||
          "Assigned campus",
        college: college || "Assigned college",
        coordinator: names.get(coordinatorId) || "Assigned coordinator",
        program: program
          ? `${program.code} — ${program.name}`
          : "Assigned program",
        hte: hte?.trade_name || hte?.name || "Assigned HTE",
        term: `${year?.label || "Academic year"} · ${term?.term?.replaceAll("_", " ") || "Term"}`,
        status: row.status
          .replaceAll("_", " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        dailyRequiredHours:
          row.daily_required_hours_snapshot == null
            ? null
            : Number(row.daily_required_hours_snapshot),
      };
    });
  },
  async listCompliance(): Promise<PlacementComplianceRecord[]> {
    const { data: requirements, error } = await createClient()
      .from("placement_compliance_requirements")
      .select("id,title,description,due_at")
      .eq("is_active", true)
      .order("due_at");
    if (error) throw new Error(error.message);
    const requirementRows = (requirements ?? []) as ComplianceRequirementRow[];
    const ids = requirementRows.map((row) => row.id);
    const { data: submissions, error: submissionError } = ids.length
      ? await createClient()
          .from("placement_compliance_submissions")
          .select(
            "id,requirement_id,coordinator_user_id,version_number,status,submitted_at,original_name,placement_compliance_reviews(feedback,reviewed_at)",
          )
          .in("requirement_id", ids)
          .order("version_number", { ascending: false })
      : { data: [], error: null };
    if (submissionError) throw new Error(submissionError.message);
    type Submission = {
      id: string;
      requirement_id: string;
      coordinator_user_id: string;
      version_number: number;
      status: string;
      submitted_at: string;
      original_name: string;
      placement_compliance_reviews?: Array<{
        feedback: string | null;
        reviewed_at: string;
      }> | null;
    };
    const rows = (submissions ?? []) as unknown as Submission[];
    const names = await namesFor(rows.map((row) => row.coordinator_user_id));
    return requirementRows.flatMap<PlacementComplianceRecord>((requirement) => {
      const matching = rows.filter(
        (row) => row.requirement_id === requirement.id,
      );
      if (!matching.length)
        return [
          {
            requirementId: requirement.id as string,
            title: requirement.title as string,
            description: String(requirement.description ?? ""),
            dueAt: requirement.due_at ? String(requirement.due_at) : "",
            coordinatorId: null,
            coordinatorName: "No submission",
            status: "Missing",
            submissionId: null,
            version: null,
            feedback: "",
            submittedAt: "",
            originalName: "",
          },
        ];
      return matching.map((row) => {
        const review = [...(row.placement_compliance_reviews ?? [])].sort(
          (a, b) => b.reviewed_at.localeCompare(a.reviewed_at),
        )[0];
        return {
          requirementId: requirement.id as string,
          title: requirement.title as string,
          description: String(requirement.description ?? ""),
          dueAt: requirement.due_at ? String(requirement.due_at) : "",
          coordinatorId: row.coordinator_user_id,
          coordinatorName: names.get(row.coordinator_user_id) || "Coordinator",
          status: row.status
            .replaceAll("_", " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
          submissionId: row.id,
          version: row.version_number,
          feedback: review?.feedback ?? "",
          submittedAt: row.submitted_at,
          originalName: row.original_name,
        };
      });
    });
  },
  async createRequirement(input: {
    title: string;
    description: string;
    dueAt: string;
  }): Promise<void> {
    const { error } = await createClient().rpc(
      "create_placement_compliance_requirement",
      {
        p_title: input.title.trim(),
        p_description: input.description.trim(),
        p_due_at: input.dueAt || null,
      },
    );
    if (error) throw new Error(error.message);
  },
  async submitCompliance(input: {
    requirementId: string;
    file: File;
    notes: string;
  }): Promise<void> {
    const supabase = createClient();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Sign in again.");
    const { data: requirement, error: requirementError } = await supabase
      .from("placement_compliance_requirements")
      .select("allowed_mime_types,max_file_size_bytes")
      .eq("id", input.requirementId)
      .single();
    if (requirementError) throw new Error(requirementError.message);
    const allowed = (requirement.allowed_mime_types ?? []) as string[];
    if (allowed.length && !allowed.includes(input.file.type))
      throw new Error(
        `Upload one of the allowed file types: ${allowed.join(", ")}.`,
      );
    if (input.file.size > Number(requirement.max_file_size_bytes))
      throw new Error(
        "This file is larger than the limit for this requirement.",
      );
    const { data: latest, error: latestError } = await supabase
      .from("placement_compliance_submissions")
      .select("version_number")
      .eq("requirement_id", input.requirementId)
      .eq("coordinator_user_id", user.id)
      .order("version_number", { ascending: false })
      .limit(1);
    if (latestError) throw new Error(latestError.message);
    const version = Number(latest?.[0]?.version_number ?? 0) + 1;
    const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectPath = `${user.id}/${input.requirementId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("placement-compliance")
      .upload(objectPath, input.file, {
        contentType: input.file.type,
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);
    const { error: insertError } = await supabase
      .from("placement_compliance_submissions")
      .insert({
        requirement_id: input.requirementId,
        coordinator_user_id: user.id,
        version_number: version,
        object_path: objectPath,
        original_name: input.file.name,
        mime_type: input.file.type,
        byte_size: input.file.size,
        notes: input.notes.trim() || null,
      });
    if (insertError) {
      await supabase.storage.from("placement-compliance").remove([objectPath]);
      throw new Error(insertError.message);
    }
  },
  async complianceDownloadUrl(submissionId: string): Promise<string> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("placement_compliance_submissions")
      .select("object_path")
      .eq("id", submissionId)
      .single();
    if (error) throw new Error(error.message);
    const signed = await supabase.storage
      .from("placement-compliance")
      .createSignedUrl(data.object_path as string, 300);
    if (signed.error) throw new Error(signed.error.message);
    return signed.data.signedUrl;
  },
  async reviewSubmission(
    submissionId: string,
    decision: "approved" | "needs_resubmission",
    feedback: string,
  ): Promise<void> {
    if (decision === "needs_resubmission" && !feedback.trim())
      throw new Error("Feedback is required when requesting resubmission.");
    const { error } = await createClient().rpc(
      "review_placement_compliance_submission",
      {
        p_submission_id: submissionId,
        p_decision: decision,
        p_feedback: feedback.trim() || null,
      },
    );
    if (error) throw new Error(error.message);
  },
  async listRequiredFormats(): Promise<RequiredFormatRecord[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("required_file_formats")
      .select(
        "id,code,name,description,required_file_format_versions(id,version_number,original_name,object_path,mime_type,status,published_at,submitted_by_user_id,submitted_at,review_feedback)",
      )
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    type VersionRow = {
      id: string;
      version_number: number;
      original_name: string;
      object_path: string;
      mime_type: string;
      status: string;
      published_at: string | null;
      submitted_by_user_id: string;
      submitted_at: string;
      review_feedback: string | null;
    };
    const rows = (data ?? []) as unknown as Array<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        required_file_format_versions?: VersionRow[] | null;
      }>;
    const submitterNames = await namesFor(
      rows.flatMap((row) =>
        (row.required_file_format_versions ?? []).map(
          (version) => version.submitted_by_user_id,
        ),
      ),
    );
    return rows.map((row) => {
      const versions = [...(row.required_file_format_versions ?? [])].sort(
        (a, b) => b.version_number - a.version_number,
      );
      const version = versions[0];
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description ?? "",
        versionId: version?.id ?? null,
        version: version?.version_number ?? null,
        fileName: version?.original_name ?? "No file submitted",
        status: version?.status
          ? version.status.replace(/^./, (letter) => letter.toUpperCase())
          : "Draft",
        publishedAt: version?.published_at ?? null,
        objectPath: version?.object_path ?? null,
        mimeType: version?.mime_type ?? null,
        submittedBy: version
          ? submitterNames.get(version.submitted_by_user_id) || "Authorized Placement Head"
          : "—",
        submittedAt: version?.submitted_at ?? null,
        reviewFeedback: version?.review_feedback ?? "",
        history: versions.map((item) => ({
          id: item.id,
          version: item.version_number,
          fileName: item.original_name,
          status: item.status.replace(/^./, (letter) => letter.toUpperCase()),
          submittedBy:
            submitterNames.get(item.submitted_by_user_id) || "Authorized Placement Head",
          submittedAt: item.submitted_at,
          publishedAt: item.published_at,
        })),
      };
    });
  },
  async createFormat(input: {
    code: string;
    name: string;
    description: string;
  }): Promise<void> {
    const { error } = await createClient().rpc("create_required_file_format", {
      p_code: input.code.trim().toUpperCase(),
      p_name: input.name.trim(),
      p_description: input.description.trim(),
    });
    if (error) throw new Error(error.message);
  },
  async submitFormatVersion(formatId: string, file: File): Promise<void> {
    const supabase = createClient();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) throw new Error("Sign in again.");
    if (!file.type || file.size > 25 * 1024 * 1024)
      throw new Error("Choose a recognized file no larger than 25 MB.");
    const { data: latest, error: latestError } = await supabase
      .from("required_file_format_versions")
      .select("version_number")
      .eq("format_id", formatId)
      .order("version_number", { ascending: false })
      .limit(1);
    if (latestError) throw new Error(latestError.message);
    const version = Number(latest?.[0]?.version_number ?? 0) + 1;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectPath = `${formatId}/${crypto.randomUUID()}-${safeName}`;
    const uploaded = await supabase.storage
      .from("required-file-formats")
      .upload(objectPath, file, { contentType: file.type, upsert: false });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const inserted = await supabase
      .from("required_file_format_versions")
      .insert({
        format_id: formatId,
        version_number: version,
        object_path: objectPath,
        original_name: file.name,
        mime_type: file.type,
        byte_size: file.size,
        submitted_by_user_id: user.id,
      });
    if (inserted.error) {
      await supabase.storage.from("required-file-formats").remove([objectPath]);
      throw new Error(inserted.error.message);
    }
  },
  async publishFormatVersion(versionId: string): Promise<void> {
    const { error } = await createClient().rpc(
      "publish_required_file_format_version",
      {
        p_version_id: versionId,
      },
    );
    if (error) throw new Error(error.message);
  },
  async requiredFormatUrl(
    record: RequiredFormatRecord,
    download = false,
  ): Promise<string> {
    if (!record.objectPath) throw new Error("No submitted file is available.");
    const { data, error } = await createClient()
      .storage.from("required-file-formats")
      .createSignedUrl(record.objectPath, 60, {
        download: download ? record.fileName : false,
      });
    if (error || !data?.signedUrl)
      throw new Error(error?.message || "A secure file link could not be created.");
    return data.signedUrl;
  },
  async returnFormatVersion(versionId: string, feedback: string): Promise<void> {
    if (!feedback.trim()) throw new Error("Feedback is required.");
    const { error } = await createClient().rpc(
      "return_required_file_format_version_v22",
      { p_version_id: versionId, p_feedback: feedback.trim() },
    );
    if (error) throw new Error(error.message);
  },
};
