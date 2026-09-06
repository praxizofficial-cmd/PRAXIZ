import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { generateEvaluationPdf, wrapReportText } from '../lib/evaluation-report.ts';
import { userError } from '../lib/user-error.ts';

const migration = await readFile(new URL('../database/20260904_official_evaluation.sql', import.meta.url), 'utf8');
const criteria = [...migration.matchAll(/\('(a-\d-\d|b-\d+)','([^']*)','([^']*)',\d+,'([^']*)','([^']*)'\)/g)]
  .map((m,i) => ({ label: m[2], description: m[3], section: m[4], group: m[5], score: i % 5 + 1, minimumScore: 1, maximumScore: 5 }));
const report = {
  evaluationId: '00000000-0000-4000-8000-000000000000', version: 1,
  title: 'PERFORMANCE EVALUATION FOR SIE/SJT/OJT STUDENTS',
  metadata: { formCode: 'PSU-F-PLU-02', revision: '00', effectivityDate: 'January 2, 2026', scoringMethod: 'individual',
    direction: 'Direction: Please rate the student by checking the space that most objectively describes him/her. Use the rating below.',
    scale: { '5': 'OUTSTANDING', '4': 'VERY SATISFACTORY', '3': 'SATISFACTORY', '2': 'UNSATISFACTORY', '1': 'POOR' } },
  studentName: 'QA SAMPLE ONLY — María Niño', evaluatorName: 'QA SAMPLE RATER',
  context: { ratingPeriod: 'August 1–31, 2026', designation: '', office: '' },
  remarks: 'TEST FIXTURE — not an institutional record. This sample verifies the printed layout only.',
  strengths: null, areasForImprovement: null,
  finalizedAt: '2026-09-04T08:00:00.000Z', scoringMethod: 'individual', weightedScore: null, criteria,
};
const assets = { font: await readFile(new URL('../lib/report-assets/DejaVuSans.ttf', import.meta.url)), seal: await readFile(new URL('../lib/report-assets/parsu-logo.png', import.meta.url)) };

test('official template contains all 18 criteria in the supplied order', () => {
  assert.equal(criteria.length, 18);
  assert.equal(criteria.filter(c => c.group === '1. Communication Skills').length, 5);
  assert.equal(criteria.filter(c => c.group === '2. Technical Skills').length, 3);
  assert.equal(criteria.filter(c => c.section === 'B. CRITICAL FACTORS').length, 10);
  assert.equal(criteria[17].label, '10. Commitment and Dedication');
  assert.match(criteria[14].description, /unofficial matters like chatting, eating, telephoning/);
});

test('PDF uses static pages, embedded font and no editable form fields', async () => {
  const bytes = await generateEvaluationPdf(report, assets);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getForm().getFields().length, 0);
  assert.equal(pdf.getTitle(), report.title);
  for (const p of pdf.getPages()) { assert.equal(p.getWidth(), 612); assert.equal(p.getHeight(), 936); }
  if (process.env.PRAXIZ_PDF_QA_DIR) {
    await mkdir(process.env.PRAXIZ_PDF_QA_DIR, { recursive: true });
    await writeFile(process.env.PRAXIZ_PDF_QA_DIR + '/official-evaluation-qa.pdf', bytes);
  }
});

test('oversized official remarks fail explicitly instead of truncating or adding pages', async () => {
  const fakeFont = { widthOfTextAtSize: text => [...text].length * 5 };
  const lines = wrapReportText('Á'.repeat(120) + '\nStudent name', fakeFont, 10, 80);
  assert.ok(lines.every(line => fakeFont.widthOfTextAtSize(line) <= 80));
  await assert.rejects(() => generateEvaluationPdf({ ...report, remarks: 'A detailed test remark. '.repeat(450) }, assets), /two-page form space/);
  await assert.rejects(() => generateEvaluationPdf({ ...report, finalizedAt: '' }, assets), /finalized/);
});

test('official form preserves two pages for long identities, cross-year periods and longer remarks', async () => {
  const cases = [
    { name: 'short', studentName: 'QA SAMPLE Ana', context: { ratingPeriod: 'Sep 6, 2026' }, remarks: 'QA SAMPLE ONLY.' },
    { name: 'long', studentName: 'QA SAMPLE María Alejandra de los Santos Villanueva', context: { ratingPeriod: 'Dec 15, 2026 – Jan 15, 2027' }, remarks: 'QA SAMPLE ONLY. The recorded performance and follow-up have been reviewed. '.repeat(8) },
  ];
  for (const item of cases) {
    const bytes = await generateEvaluationPdf({ ...report, ...item }, assets);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
    if (process.env.PRAXIZ_PDF_QA_DIR) {
      await mkdir(process.env.PRAXIZ_PDF_QA_DIR, { recursive: true });
      await writeFile(process.env.PRAXIZ_PDF_QA_DIR + `/official-evaluation-${item.name}-qa.pdf`, bytes);
    }
  }
});

test('migration guards ownership, submitted/final states and released-version access', () => {
  assert.match(migration, /e\.evaluator_user_id <> auth\.uid\(\)/);
  assert.match(migration, /if e\.status <> 'draft' then/);
  assert.match(migration, /private\.can_finalize_evaluation\(p_evaluation_id\)/);
  assert.match(migration, /e\.status='finalized' and e\.current_version_id=v\.id/);
  assert.equal((migration.match(/as restrictive for select to authenticated/g) || []).length, 3);
  assert.match(migration, /and auth\.uid\(\) is not null and private\.can_view_evaluation\(e\.id\)/);
  assert.match(migration, /calculated_score:=null; calculated_percentage:=null/);
});

test('database technical messages are translated', () => {
  assert.doesNotMatch(userError(new Error('duplicate key value violates unique constraint academic_programs_idx')), /constraint|academic_programs/);
  assert.match(userError(new Error('permission denied for table evaluations')), /permission/);
  assert.match(userError(new Error('column form_metadata does not exist')), /database update/);
  assert.equal(userError(new Error('invalid input syntax for type uuid'), 'Please try again.'), 'Please try again.');
});

test('legacy zero ratings are not mistaken for unanswered criteria', async () => {
  const service = await readFile(new URL('../app/services/praxiz-services.ts', import.meta.url), 'utf8');
  assert.match(service, /score: scoreByCriterion\.get\(criterion\.id\) \?\? Number\.NaN/);
  assert.match(service, /input\.criteria\.filter\(\(criterion\) => Number\.isFinite\(criterion\.score\)\)/);
  const scores = [Number.NaN, 0, 1.5, 5].filter(Number.isFinite);
  assert.deepEqual(scores, [0, 1.5, 5]);
});
