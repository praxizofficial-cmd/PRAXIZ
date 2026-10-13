import type { MonthlyDtrSnapshot } from "../../lib/monthly-dtr-report";
import { createClient } from "../../lib/supabase/client";

export type MonthlyDtrAssignmentOption = {
  assignmentId: string;
  studentName: string;
  studentNumber: string;
  hteName: string;
  programName: string;
  assignmentStatus: string;
};

export type MonthlyDtrSubmissionResult = {
  id: string;
  created: boolean;
  status: "submitted" | "superseded";
  submittedAt: string;
  submittedByRole: "Student Intern" | "HTE Representative";
  recipientCoordinatorUserId: string;
};

function monthStart(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new Error("Select a valid calendar month.");
  return `${value}-01`;
}

function asReport(data: unknown) {
  if (!data || typeof data !== "object") {
    throw new Error("The monthly DTR response was invalid.");
  }
  return data as MonthlyDtrSnapshot;
}

export const monthlyDtrService = {
  async listAssignments(): Promise<MonthlyDtrAssignmentOption[]> {
    const { data, error } = await createClient().rpc("list_monthly_dtr_assignments");
    if (error) throw new Error(error.message);
    type Row = {
      assignment_id: string;
      student_name: string;
      student_number: string;
      hte_name: string;
      program_name: string;
      assignment_status: string;
    };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      assignmentId: row.assignment_id,
      studentName: row.student_name,
      studentNumber: row.student_number,
      hteName: row.hte_name,
      programName: row.program_name,
      assignmentStatus: row.assignment_status,
    }));
  },

  async list(month?: string): Promise<MonthlyDtrSnapshot[]> {
    const { data, error } = await createClient().rpc("list_monthly_dtr_reports", {
      p_reporting_month: month ? monthStart(month) : null,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<{ report: unknown }>).map((row) => asReport(row.report));
  },

  async prepare(assignmentId: string, month: string): Promise<MonthlyDtrSnapshot> {
    const { data, error } = await createClient().rpc("prepare_monthly_dtr", {
      p_assignment_id: assignmentId,
      p_reporting_month: monthStart(month),
    });
    if (error) throw new Error(error.message);
    return asReport(data);
  },

  async get(reportId: string): Promise<MonthlyDtrSnapshot> {
    const { data, error } = await createClient().rpc("get_monthly_dtr_report", {
      p_report_id: reportId,
    });
    if (error) throw new Error(error.message);
    return asReport(data);
  },

  async finalize(reportId: string, remarks: string): Promise<MonthlyDtrSnapshot> {
    const { data, error } = await createClient().rpc("finalize_monthly_dtr", {
      p_report_id: reportId,
      p_remarks: remarks.trim() || null,
    });
    if (error) throw new Error(error.message);
    return asReport(data);
  },

  async requestCorrection(reportId: string, remarks: string): Promise<MonthlyDtrSnapshot> {
    const { data, error } = await createClient().rpc("request_monthly_dtr_correction", {
      p_report_id: reportId,
      p_remarks: remarks.trim(),
    });
    if (error) throw new Error(error.message);
    return asReport(data);
  },

  async createRevision(reportId: string, reason: string): Promise<MonthlyDtrSnapshot> {
    const { data, error } = await createClient().rpc("create_monthly_dtr_revision", {
      p_report_id: reportId,
      p_reason: reason.trim(),
    });
    if (error) throw new Error(error.message);
    return asReport(data);
  },

  async submit(reportId: string): Promise<MonthlyDtrSubmissionResult> {
    const { data, error } = await createClient().rpc("submit_monthly_dtr", {
      p_report_id: reportId,
    });
    if (error) throw new Error(error.message);
    return data as unknown as MonthlyDtrSubmissionResult;
  },
};
