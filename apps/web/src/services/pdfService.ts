import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CONDITION_COLOR, CONDITION_LABEL, CONDITIONS, balanceCents, dentitionOf, toothLayout, type Dentition } from '@clinic/shared';
import { buildChart } from '../domain/chart';
import { ageOf, formatDate, formatTime } from '../domain/format';
import type { PatientBundle } from '../hooks/useData';

const TEAL: [number, number, number] = [13, 148, 136];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];

// jsPDF's built-in fonts have no peso sign, so amounts are written as "PHP 1,500.00" in the PDF.
const money = (cents: number) => `PHP ${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

async function imageAspect(dataUrl: string): Promise<number> {
  try {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const ratio = bmp.width / bmp.height;
    bmp.close();
    return ratio;
  } catch {
    return 1;
  }
}

/** Builds a styled, printable patient record: details, dental chart, procedure history and balances. */
export async function exportPatientPdf(bundle: PatientBundle, clinicName = 'Dental Clinic'): Promise<void> {
  const { patient, contacts, procedures, records, entries } = bundle;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  // ---- header band ----
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(16).text(clinicName, M, 11);
  doc.setFont('helvetica', 'normal').setFontSize(10).text('Patient Record', M, 18);
  doc.text(`Generated ${formatDate(new Date().toISOString().slice(0, 10))}`, W - M, 18, { align: 'right' });

  // ---- patient block ----
  let y = 34;
  let textX = M;
  if (patient.photo) {
    const h = 32;
    const w = Math.min(40, h * (await imageAspect(patient.photo)));
    try {
      doc.addImage(patient.photo, 'JPEG', M, y - 4, w, h);
      textX = M + w + 6;
    } catch {
      /* unreadable image: skip it */
    }
  }
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(15).text(patient.fullName, textX, y + 2);
  const age = ageOf(patient.birthDate);
  const outstanding = procedures.reduce((s, p) => s + balanceCents(p), 0);
  const last = procedures[0]?.date ?? '';
  const info: [string, string][] = [
    ['Age', age === null ? '-' : `${age} (born ${formatDate(patient.birthDate)})`],
    ['Civil status', patient.civilStatus || '-'],
    ['Citizenship', patient.citizenship || '-'],
    ['Occupation', patient.occupation || '-'],
    ['Address', patient.address || '-'],
    ['Last visit', last ? formatDate(last) : '-'],
    ['Outstanding balance', money(outstanding)],
  ];
  autoTable(doc, {
    startY: y + 5,
    margin: { left: textX, right: M },
    theme: 'plain',
    body: info,
    styles: { fontSize: 9, cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 2 }, textColor: INK },
    columnStyles: { 0: { textColor: MUTED, cellWidth: 36 } },
  });
  y = Math.max((doc as any).lastAutoTable.finalY, patient.photo ? y + 30 : 0) + 4;

  if (contacts.length) {
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...MUTED).text('CONTACTS', M, y);
    y += 4;
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    for (const c of contacts) {
      doc.text(`${c.type[0].toUpperCase()}${c.type.slice(1)}${c.label ? ` (${c.label})` : ''}: ${c.value}`, M, y);
      y += 4.5;
    }
    y += 2;
  }
  if (patient.remarks) {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...MUTED).text('REMARKS', M, y);
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    const lines = doc.splitTextToSize(patient.remarks, W - 2 * M) as string[];
    doc.text(lines, M, y + 4.5);
    y += 4.5 + lines.length * 4.2 + 3;
  }

  // ---- dental chart ----
  const chart = buildChart(records, entries);
  const usesPrimary = [...chart.keys()].some((t) => dentitionOf(t) === 'primary');
  const dentitions: Dentition[] = usesPrimary ? ['permanent', 'primary'] : ['permanent'];
  const chartH = (d: Dentition) => toothLayout(d).height * ((W - 2 * M) / toothLayout(d).width) * 0.62;
  if (y + chartH('permanent') + 20 > 285) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TEAL).text('Dental Chart (FDI)', M, y);
  y += 3;
  for (const d of dentitions) {
    const layout = toothLayout(d);
    const k = Math.min((W - 2 * M) / layout.width, 0.62);
    const ox = M + (W - 2 * M - layout.width * k) / 2;
    for (const t of layout.teeth) {
      const cond = chart.get(t.tooth)?.condition ?? 'healthy';
      doc.setFillColor(...hex(CONDITION_COLOR[cond])).setDrawColor(...(cond === 'crown' ? hex('#a16207') : hex('#94a3b8'))).setLineWidth(cond === 'crown' ? 0.6 : 0.25);
      if (cond === 'missing') doc.setLineDashPattern([0.8, 0.8], 0);
      doc.roundedRect(ox + t.x * k, y + t.y * k, t.w * k, t.h * k, 1.5, 1.5, 'FD');
      doc.setLineDashPattern([], 0);
      if (cond === 'missing' || cond === 'extracted') {
        const cx = ox + (t.x + t.w / 2) * k, cy = y + (t.y + t.h / 2) * k;
        doc.setDrawColor(cond === 'extracted' ? 255 : 71, cond === 'extracted' ? 255 : 85, cond === 'extracted' ? 255 : 105).setLineWidth(0.4);
        doc.line(cx - 1.6, cy - 1.6, cx + 1.6, cy + 1.6).line(cx + 1.6, cy - 1.6, cx - 1.6, cy + 1.6);
      }
      doc.setFontSize(6).setFont('helvetica', 'normal').setTextColor(...MUTED);
      doc.text(String(t.tooth), ox + (t.x + t.w / 2) * k, t.upper ? y + (layout.rowUpperY - 3) * k : y + (layout.rowLowerY + 40 + 9) * k, { align: 'center' });
    }
    y += layout.height * k + 2;
  }
  // legend
  let lx = M;
  doc.setFontSize(7.5);
  for (const c of CONDITIONS) {
    doc.setFillColor(...hex(CONDITION_COLOR[c])).setDrawColor(...hex('#94a3b8')).setLineWidth(0.2).rect(lx, y - 2.6, 3, 3, 'FD');
    doc.setTextColor(...INK).text(CONDITION_LABEL[c], lx + 4.2, y);
    lx += 4.2 + doc.getTextWidth(CONDITION_LABEL[c]) + 4;
  }
  y += 8;

  // ---- procedures ----
  const toothByProcedure = new Map<string, number[]>();
  for (const e of entries) if (e.procedureId) toothByProcedure.set(e.procedureId, [...(toothByProcedure.get(e.procedureId) ?? []), e.tooth]);
  const totalCost = procedures.reduce((s, p) => s + p.costCents, 0);
  const totalPaid = procedures.reduce((s, p) => s + p.paidCents, 0);

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TEAL);
  if (y > 262) {
    doc.addPage();
    y = 16;
  }
  doc.text('Procedure History', M, y);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: M, right: M },
    head: [
      [
        'Date',
        'Procedure',
        'Teeth',
        { content: 'Cost', styles: { halign: 'right' } },
        { content: 'Paid', styles: { halign: 'right' } },
        { content: 'Balance', styles: { halign: 'right' } },
        'Remarks',
      ],
    ],
    body: procedures.map((p) => [
      `${formatDate(p.date)}${p.time ? `\n${formatTime(p.time)}` : ''}`,
      p.type,
      (toothByProcedure.get(p.id) ?? []).sort((a, b) => a - b).join(', ') || '-',
      money(p.costCents),
      money(p.paidCents),
      money(balanceCents(p)),
      p.remarks,
    ]),
    foot: [['', 'Total', '', money(totalCost), money(totalPaid), money(totalCost - totalPaid), '']],
    headStyles: { fillColor: TEAL, textColor: 255, fontSize: 8.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8.5, textColor: INK, cellPadding: 1.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { cellWidth: 38 } },
    showFoot: 'lastPage',
  });

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(...MUTED).setFont('helvetica', 'normal');
    doc.text(`${patient.fullName} · Confidential patient record`, M, 292);
    doc.text(`Page ${i} of ${pages}`, W - M, 292, { align: 'right' });
  }

  const safe = patient.fullName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'patient';
  doc.save(`${safe}-record.pdf`);
}
