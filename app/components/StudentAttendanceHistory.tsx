"use client";
import { useEffect, useState } from 'react';
import { attendanceService, type AttendanceHistoryRow } from '../services/praxiz-services';
import { Dialog } from './Dialog';
import { userError } from '../../lib/user-error';

export function StudentAttendanceHistory({ studentId, name, onClose }: { studentId: string; name: string; onClose: () => void }) {
  const [rows, setRows] = useState<AttendanceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void attendanceService.listLiveHistory(studentId).then(data => { if (active) setRows(data); })
      .catch(reason => { if (active) setError(userError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId]);
  return <Dialog title={`Attendance · ${name}`} onClose={onClose} wide>
    <p>Original server timestamps are read-only. Only records within your authorized scope are shown.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading attendance history…</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Verified hours</th><th>Status</th><th>Reviewer</th><th>Remarks</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.timeIn}</td><td>{row.timeOut}</td><td>{row.hours}</td><td>{row.status}</td><td>{row.verifiedBy}</td><td>{row.remarks}</td></tr>)}{!rows.length && <tr><td colSpan={7}>No attendance records are available for this student in your scope.</td></tr>}</tbody></table></div>}
  </Dialog>;
}
