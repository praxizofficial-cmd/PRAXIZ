import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export type EvaluationFormMetadata = {
  formCode: string; revision: string; effectivityDate: string;
  direction: string; scoringMethod: 'individual'; scale: Record<string, string>;
};
export type FinalizedEvaluationReport = {
  evaluationId: string; version: number; title: string;
  metadata: EvaluationFormMetadata | null;
  studentName: string; evaluatorName: string;
  context: { ratingPeriod?: string; designation?: string; office?: string };
  remarks: string | null; strengths: string | null; areasForImprovement: string | null;
  finalizedAt: string; scoringMethod: string; weightedScore: number | null;
  criteria: Array<{ label: string; description: string | null; section?: string; group?: string; score: number; minimumScore: number; maximumScore: number }>;
};

export function wrapReportText(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (font.widthOfTextAtSize(`${line}${line ? ' ' : ''}${word}`, size) <= width) {
        line += `${line ? ' ' : ''}${word}`;
      } else {
        if (line) result.push(line);
        line = '';
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ''; }
          line += character;
        }
      }
    }
    result.push(line);
  }
  return result;
}

// Render text, lines and vector rating marks, never an image of the form.
// All data comes from the authorized, immutable finalization snapshot.
export async function generateEvaluationPdf(report: FinalizedEvaluationReport, assets: { font: Uint8Array; seal: Uint8Array }): Promise<Uint8Array> {
  if (!report.finalizedAt || !report.criteria.length) throw new Error('A finalized evaluation is required.');
  if (report.metadata?.formCode === 'PSU-F-PLU-02') return generateOfficialPdf(report, assets);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(assets.font, { subset: true });
  const seal = await pdf.embedPng(assets.seal);
  pdf.setTitle(report.title);
  pdf.setAuthor('Partido State University · PRAXIZ');
  pdf.setCreationDate(new Date(report.finalizedAt));
  pdf.setModificationDate(new Date(report.finalizedAt));
  const navy = rgb(.05, .12, .30);
  const gray = rgb(.30, .34, .40);
  let page: PDFPage;
  let y = 0;
  function addPage() {
    page = pdf.addPage([595.28, 841.89]);
    page.drawImage(seal, { x: 40, y: 742, width: 66, height: 66 });
    page.drawText('Republic of the Philippines', { x: 171, y: 795, size: 11, font, color: navy });
    page.drawText('PARTIDO STATE UNIVERSITY', { x: 141, y: 774, size: 16, font, color: navy });
    page.drawText('Camarines Sur', { x: 244, y: 756, size: 11, font, color: navy });
    page.drawLine({ start: { x: 40, y: 732 }, end: { x: 555, y: 732 }, thickness: 1, color: navy });
    y = 711;
  }
  function text(value: string, size = 10, width = 515, color = gray) {
    const lines = wrapReportText(value, font, size, width);
    for (const line of lines) {
      if (y < 77) addPage();
      page.drawText(line, { x: 40, y, size, font, color });
      y -= size * 1.5;
    }
  }
  addPage();
  text(report.title, 13, 515, navy);
  y -= 10;
  text(`Name of Student: ${report.studentName}`, 11);
  text(`Rating Period: ${report.context.ratingPeriod || ''}`, 11);
  y -= 9;
  if (report.metadata) {
    text(report.metadata.direction, 10);
    y -= 7;
    text([5,4,3,2,1].map(n => `${n} – ${report.metadata!.scale[String(n)]}`).join('     '), 9);
  }
  let section = ''; let group = '';
  for (const criterion of report.criteria) {
    const labelLines = wrapReportText(`${criterion.label}${criterion.description ? ` - ${criterion.description}` : ''}`, font, 10, 350);
    const needsHeading = criterion.section !== section || criterion.group !== group;
    if (y - Math.max(labelLines.length * 14, 25) - (needsHeading ? 66 : 15) < 80) { addPage(); section = ''; group = ''; }
    if (criterion.section && criterion.section !== section) {
      y -= 15; text(criterion.section, 12, 515, navy); section = criterion.section; group = '';
    }
    if (criterion.group && criterion.group !== group) { y -= 14; text(criterion.group, 10, 515, navy); group = criterion.group; }
    y -= 9;
    const startY = y;
    for (const line of labelLines) { page!.drawText(line, { x: 40, y, font, size: 10, color: gray }); y -= 14; }
    if (report.metadata) {
      [5,4,3,2,1].forEach((rating, index) => {
        const x = 413 + index * 28;
        page!.drawText(String(rating), { x: x + 3, y: startY + 2, size: 8, font, color: gray });
        page!.drawRectangle({ x, y: startY - 18, width: 13, height: 13, borderWidth: .6, borderColor: gray });
        if (criterion.score === rating) {
          page!.drawLine({ start: { x: x+2, y: startY-12 }, end: { x: x+5, y: startY-15 }, thickness: 1.4, color: navy });
          page!.drawLine({ start: { x: x+5, y: startY-15 }, end: { x: x+11, y: startY-7 }, thickness: 1.4, color: navy });
        }
      });
      y = Math.min(y, startY - 25);
    } else {
      page!.drawText(`${criterion.score} / ${criterion.maximumScore}`, { x: 458, y: startY, font, size: 11, color: navy });
    }
    page!.drawLine({ start: { x: 40, y: y - 3 }, end: { x: 555, y: y - 3 }, thickness: .3, color: rgb(.82,.84,.87) });
    y -= 5;
  }
  if (y < 170) addPage();
  y -= 12;
  text('REMARKS', 11, 515, navy); text(report.remarks || 'No remarks recorded.');
  if (!report.metadata) {
    if (report.strengths) { y -= 10; text('Strengths', 11, 515, navy); text(report.strengths); }
    if (report.areasForImprovement) { y -= 10; text('Areas for improvement', 11, 515, navy); text(report.areasForImprovement); }
  }
  y -= 12;
  text(`Rater/Designation: ${report.evaluatorName}${report.context.designation ? ` / ${report.context.designation}` : ''}`, 11);
  text(`Office: ${report.context.office || ''}`, 11);
  y -= 8;
  text(`Finalized: ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.finalizedAt))}`, 9);
  text('Electronically recorded in PRAXIZ. No handwritten signature is reproduced.', 8);
  pdf.getPages().forEach((p, index) => {
    p.drawLine({ start: { x: 40, y: 56 }, end: { x: 555, y: 56 }, thickness: .7, color: navy });
    p.drawText(report.metadata ? `${report.metadata.formCode} · Rev. No. ${report.metadata.revision} · Effectivity Date: ${report.metadata.effectivityDate}` : 'PRAXIZ · Historical evaluation report', { x: 40, y: 42, size: 8, font, color: navy });
    p.drawText(`Page ${index+1} of ${pdf.getPageCount()}`, { x: 482, y: 28, size: 8, font, color: navy });
    p.drawText(`Record ${report.evaluationId} · Version ${report.version}`, { x: 40, y: 28, size: 7, font, color: gray });
  });
  return pdf.save();
}

// Preserve the official two-page form. Group each criterion with its rating;
// flow rows from their measured text height, never truncate a finalized record.
async function generateOfficialPdf(report: FinalizedEvaluationReport, assets: { font: Uint8Array; seal: Uint8Array }) {
  if (report.criteria.length !== 18 || report.criteria.some(c => !Number.isInteger(c.score) || c.score < 1 || c.score > 5)) throw new Error('The official form requires all 18 finalized ratings, each from 1 to 5.');
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const body = await pdf.embedFont(assets.font, { subset: true });
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const seal = await pdf.embedPng(assets.seal);
  const ink = rgb(0,0,0); const navy = rgb(0,32/255,96/255);
  pdf.setTitle(report.title); pdf.setAuthor('Partido State University · PRAXIZ');
  pdf.setCreationDate(new Date(report.finalizedAt)); pdf.setModificationDate(new Date(report.finalizedAt));
  const pages = [pdf.addPage([612,936]),pdf.addPage([612,936])];
  function draw(page: PDFPage, value: string, x: number, y: number, size = 10, font = body, color = ink) {
    page.drawText(value,{x,y,size,font,color});
  }
  function center(page: PDFPage, value: string, y: number, size: number, font = body, color = ink) {
    draw(page,value,(612-font.widthOfTextAtSize(value,size))/2,y,size,font,color);
  }
  function line(page: PDFPage,x: number,y: number,end: number,color=ink) { page.drawLine({start:{x,y},end:{x:end,y},thickness:.55,color}); }
  function paragraph(page: PDFPage,value: string,x: number,y: number,width: number,size=10,leading=13) {
    const lines = wrapReportText(value,body,size,width);
    lines.forEach((value,i)=>draw(page,value,x,y-i*leading,size));
    return y-lines.length*leading;
  }
  function underlinedValue(page: PDFPage,value: string,x: number,y: number,width: number,label: string) {
    const lines = wrapReportText(value,body,10,width);
    if (lines.length>2) throw new Error(`${label} is too long for the official form. Please contact the coordinator to review the recorded details.`);
    lines.forEach((value,i)=>draw(page,value,x,y+14+(lines.length-1-i)*13,10));
    line(page,x,y+9,x+width); draw(page,label,x,y-5,10);
  }
  const scoreXs = [476,500,524,548,572];
  function rating(page: PDFPage,score: number,y: number) {
    [5,4,3,2,1].forEach((n,i)=>{
      line(page,scoreXs[i]-6,y-5,scoreXs[i]+6);
      if(n===score) { draw(page,'✓',scoreXs[i]-5,y-2,12,body,navy); }
    });
  }
  pages.forEach((page,i)=>{
    page.drawImage(seal,{x:36,y:802,width:60.48,height:60.48});
    page.drawLine({start:{x:108,y:798},end:{x:108,y:864},thickness:.65,color:navy});
    center(page,'Republic of the Philippines',850,12,serif,navy);
    center(page,'PARTIDO STATE UNIVERSITY',830,14,bold,navy);
    center(page,'Camarines Sur',813,12,bold,navy);
    line(page,36,791,576,navy); draw(page,'PSU-F-PLU-02',495,799,9,serif,navy);
    line(page,36,53,576,navy);
    draw(page,`Effectivity Date: ${report.metadata!.effectivityDate}`,36,38,9,serif,navy);
    center(page,`Rev. No: ${report.metadata!.revision}`,38,9,serif,navy);
    draw(page,`Page ${i+1} of 2`,526,38,9,serif,navy);
  });
  const p1=pages[0],p2=pages[1];
  center(p1,report.title,768,12,bold);
  draw(p1,'Name of Student:',36,742,10);
  const nameLines=wrapReportText(report.studentName,body,10,221);
  if(nameLines.length>2) throw new Error('The student name is too long for the official form field. Please contact the coordinator.');
  nameLines.forEach((value,i)=>draw(p1,value,126,742-i*13,10));
  line(p1,124,739-(nameLines.length-1)*13,345);
  draw(p1,'Rating Period:',357,742,10);
  const period=report.context.ratingPeriod || '';
  const periodLines=wrapReportText(period,body,9,146);
  if(periodLines.length>2) throw new Error('The rating period is too long for the official form. Please contact the coordinator.');
  periodLines.forEach((value,i)=>draw(p1,value,430,742-i*13,9));
  line(p1,429,739-(Math.max(1,periodLines.length)-1)*13,576);
  paragraph(p1,report.metadata!.direction,36,714,540,11,14);
  const guide=[5,4,3,2,1].map(n=>`${n} – ${report.metadata!.scale[String(n)]}`);
  let guideX=36; const widths=guide.map(value=>body.widthOfTextAtSize(value,7));
  const gap=(540-widths.reduce((a,b)=>a+b,0))/4;
  guide.forEach((value,i)=>{draw(p1,value,guideX,666,7);guideX+=widths[i]+gap;});
  draw(p1,'A. COMPETENCE',36,642,10,bold);
  [5,4,3,2,1].forEach((n,i)=>draw(p1,String(n),scoreXs[i]-3,642,9));
  let y=620; let group='';
  report.criteria.slice(0,8).forEach(criterion=>{
    if(criterion.group!==group) { draw(p1,criterion.group || '',62,y,10,bold);y-=23;group=criterion.group || ''; }
    const start=y;
    y=paragraph(p1,`${criterion.label}${criterion.description ? ` – ${criterion.description}` : ''}`,86,y,365,10,13)-11;
    rating(p1,criterion.score,start);
  });
  y-=12; draw(p1,'B. CRITICAL FACTORS',36,y,10,bold); y-=27;
  report.criteria.slice(8,12).forEach(criterion=>{
    const start=y; y=paragraph(p1,`${criterion.label} – ${criterion.description || ''}`,62,y,390,10,13)-15;
    rating(p1,criterion.score,start);
  });
  const fifth=report.criteria[12]; const full=`${fifth.label} – ${fifth.description || ''}`;
  const fitsFirstPage = y - wrapReportText(full,body,10,390).length*13 >= 75;
  if(fitsFirstPage) { paragraph(p1,full,62,y,390,10,13); rating(p1,fifth.score,y); }
  // Move the entire row when needed; do not strand its title or rating on page 1.
  y=738;
  [5,4,3,2,1].forEach((n,i)=>draw(p2,String(n),scoreXs[i]-3,762,9));
  report.criteria.slice(fitsFirstPage ? 13 : 12).forEach(criterion=>{
    const start=y;y=paragraph(p2,`${criterion.label} – ${criterion.description || ''}`,62,y,390,10,13)-18;
    rating(p2,criterion.score,start);
  });
  y-=8;draw(p2,'REMARKS:',62,y,10,bold);y-=22;
  const remarks=wrapReportText(report.remarks || '',body,10,490);
  if(y-remarks.length*14<180) throw new Error('The recorded remarks exceed the official two-page form space. Ask the coordinator to review the remarks; the original record has not been changed.');
  remarks.forEach(value=>{draw(p2,value,76,y,10);line(p2,76,y-4,566);y-=14;});
  while(y>190) {line(p2,76,y-4,566);y-=22;}
  underlinedValue(p2,`${report.evaluatorName}${report.context.designation ? ` / ${report.context.designation}` : ''}`,62,117,236,'Rater/Designation');
  underlinedValue(p2,report.context.office || '',350,117,216,'Office');
  return pdf.save();
}
