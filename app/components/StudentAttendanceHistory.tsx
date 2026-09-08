"use client";
import { useEffect, useState } from 'react';
import { attendanceService, type AttendanceHistoryRow } from '../services/praxiz-services';
import { Dialog } from './Dialog';
import { userError } from '../../lib/user-error';

export function StudentAttendanceHistory({ studentId, name, onClose }: { studentId: string; name: string; onClose: () => void }) {
  const [rows, setRows] = useState<AttendanceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  useEffect(() => {
    let active = true;
    void attendanceService.listLiveHistory(studentId).then(data => { if (active) setRows(data); })
      .catch(reason => { if (active) setError(userError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId]);
  const months = [...new Set(rows.map(row => row.workDate.slice(5, 7)))].sort();
  const years = [...new Set(rows.map(row => row.workDate.slice(0, 4)))].sort().reverse();
  const visible = rows.filter(row => (month === 'all' || row.workDate.slice(5, 7) === month) && (year === 'all' || row.workDate.slice(0, 4) === year));
  const monthLabel = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', timeZone: 'Asia/Manila' }).format(new Date(`2026-${value}-01T00:00:00+08:00`));
  function exportCsv() {
    const escape = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" : '')}${value.replaceAll('"', '""')}"`;
    const header = ['Date','Time In','Time Out','Rendered Hours','Verification Status','Reviewer','Remarks'];
    const content = [header, ...visible.map(row => [row.date,row.timeIn,row.timeOut,row.hours,row.status,row.verifiedBy,row.remarks])].map(row => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `praxiz-attendance-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year === 'all' ? 'all-years' : year}-${month === 'all' ? 'all-months' : month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <Dialog title={`Attendance · ${name}`} onClose={onClose} wide>
    <p>Original server timestamps are read-only. Only records within your authorized scope are shown.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && <div className="attendance-table-actions"><div className="attendance-filter-group"><label className="field compact-field"><span>Month</span><select value={month} onChange={event => setMonth(event.target.value)}><option value="all">All months</option>{months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label><label className="field compact-field"><span>Year</span><select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><button className="button button-secondary" disabled={!visible.length} onClick={exportCsv}>Export filtered CSV</button></div>}
    {loading ? <p role="status">Loading attendance history…</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Verified hours</th><th>Status</th><th>Reviewer</th><th>Remarks</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.timeIn}</td><td>{row.timeOut}</td><td>{row.hours}</td><td>{row.status}</td><td>{row.verifiedBy}</td><td>{row.remarks}</td></tr>)}{!visible.length && <tr><td colSpan={7}>No attendance records match this month and year.</td></tr>}</tbody></table></div>}
  </Dialog>;
}
