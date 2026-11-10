import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CONDITION_COLOR,
  CONDITION_LABEL,
  CONDITIONS,
  PAYMENT_METHOD_LABEL,
  SHAPE_H,
  SHAPE_W,
  nationalityOf,
  chartsFor,
  flattenPath,
  formatName,
  toothLayout,
  toothShape,
  type Condition,
  type Dentition,
  type ToothBox,
} from '@clinic/shared';
import { buildChart } from '../domain/chart';
import { classificationOf } from '../domain/classification';
import { ageOf, formalName, formatAddress, formatDate, formatTime } from '../domain/format';
import type { PatientBundle } from '../hooks/useData';

/** Where the last jspdf-autotable table ended (the plugin records it on the document). */
const lastTableY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

type RGB = [number, number, number];
const TEAL: RGB = [13, 148, 136];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [148, 163, 184];
const ENAMEL: RGB = [255, 255, 255];
const ROOT: RGB = [245, 236, 215];

// jsPDF's built-in fonts have no peso sign, so amounts are written as "PHP 1,500.00" in the PDF.
const money = (cents: number) => `PHP ${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

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

/** Draws one anatomical tooth (same outlines and transforms as the on-screen Odontogram). */
function drawTooth(doc: jsPDF, t: ToothBox, condition: Condition, ox: number, oy: number, k: number) {
  const shape = toothShape(t.tooth);
  const sx = t.w / SHAPE_W;
  const sy = t.h / SHAPE_H;
  const tilt = condition === 'impacted' ? (22 * Math.PI) / 180 : 0;
  // shape space → page (mm): optional tilt about (15,40), scale into the box, mirror lower teeth.
  const map = ([px, py]: [number, number]): [number, number] => {
    if (tilt) {
      const dx = px - 15, dy = py - 40;
      [px, py] = [15 + dx * Math.cos(tilt) - dy * Math.sin(tilt), 40 + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
    }
    const x = t.x + px * sx;
    const y = t.upper ? t.y + py * sy : t.y + t.h - py * sy;
    return [ox + x * k, oy + y * k];
  };
  const poly = (pts: [number, number][], style: 'F' | 'S' | 'FD', closed = true) => {
    const p = pts.map(map);
    const deltas = p.slice(1).map((q, i) => [q[0] - p[i][0], q[1] - p[i][1]]);
    doc.lines(deltas, p[0][0], p[0][1], [1, 1], style, closed);
  };

  const faded = condition === 'missing' || condition === 'extracted';
  doc.setLineWidth(0.18).setDrawColor(...(faded ? hex('#cbd5e1') : LINE));
  if (condition === 'missing') doc.setLineDashPattern([0.6, 0.6], 0);

  doc.setFillColor(...(faded ? hex('#f1f5f9') : ROOT));
  for (const r of shape.roots) poly(flattenPath(r), condition === 'missing' ? 'S' : 'FD');
  const crownFill: RGB =
    condition === 'crown' ? hex(CONDITION_COLOR.crown) : condition === 'impacted' ? hex('#e9d5ff') : faded ? hex('#f1f5f9') : ENAMEL;
  doc.setFillColor(...crownFill);
  poly(flattenPath(shape.crown), condition === 'missing' ? 'S' : 'FD');
  doc.setLineDashPattern([], 0);

  if (condition === 'cavity') {
    doc.setFillColor(...hex(CONDITION_COLOR.cavity));
    for (const [cx, cy, r] of [[13, 45, 3.6], [18.5, 50, 2.2]]) {
      const [x, y] = map([cx, cy]);
      doc.circle(x, y, r * sx * k, 'F');
    }
  } else if (condition === 'filled') {
    doc.setFillColor(...hex(CONDITION_COLOR.filled));
    poly([[9, 39], [21, 39], [21, 49], [9, 49]], 'F');
  } else if (condition === 'root_canal') {
    doc.setDrawColor(...hex(CONDITION_COLOR.root_canal)).setLineWidth(0.45);
    for (const c of shape.canals) poly(flattenPath(c), 'S', false);
  } else if (condition === 'extracted') {
    doc.setDrawColor(...hex('#dc2626')).setLineWidth(0.4);
    poly([[5, 34], [25, 60]], 'S', false);
    poly([[25, 34], [5, 60]], 'S', false);
  }
}

/** Builds a styled, printable patient record: details, dental chart, procedures and payments. */
export async function exportPatientPdf(bundle: PatientBundle, clinicName = 'Dental Clinic'): Promise<void> {
  const { patient, contacts, procedures, payments, paid, records, entries } = bundle;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const name = formalName(patient);
  const paidOf = (id: string) => paid.get(id) ?? 0;

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
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(15).text(name, textX, y + 2);
  const age = ageOf(patient.birthDate);
  const outstanding = procedures.reduce((s, p) => s + p.costCents - paidOf(p.id), 0);
  const last = procedures[0]?.date ?? '';
  const info: [string, string][] = [
    ['Age', age === null ? '-' : `${age} (born ${formatDate(patient.birthDate)})`],
    ['Civil status', patient.civilStatus || '-'],
    ['Citizenship', nationalityOf(patient.citizenshipCode) || '-'],
    ['Occupation', patient.occupation || '-'],
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
  y = Math.max(lastTableY(doc), patient.photo ? y + 30 : 0) + 4;

  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(...MUTED).text(title, M, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    for (const l of lines) {
      const wrapped = doc.splitTextToSize(l, W - 2 * M) as string[];
      doc.text(wrapped, M, y);
      y += wrapped.length * 4.2 + 0.4;
    }
    y += 2.5;
  };
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  section('CONTACTS', contacts.map((c) => `${cap(c.type)}${c.label ? ` (${c.label})` : ''}${c.isPrimary && contacts.length > 1 ? ' [primary]' : ''}: ${c.value}`));
  section('ADDRESS', formatAddress(patient) ? [formatAddress(patient)] : []);
  section('REMARKS', patient.remarks ? [patient.remarks] : []);

  // ---- dental chart ----
  const chart = buildChart(records, entries);
  // Only the chart(s) for the patient's dental classification, like the screen.
  const dentitions: Dentition[] = chartsFor(classificationOf(bundle.patient).value);
  const scaleOf = (d: Dentition) => Math.min((W - 2 * M) / toothLayout(d).width, 0.5);
  if (y + toothLayout('permanent').height * scaleOf('permanent') + 20 > 285) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TEAL).text('Dental Chart (FDI)', M, y);
  y += 2;
  for (const d of dentitions) {
    const L = toothLayout(d);
    const k = scaleOf(d);
    if (y + L.height * k > 285) {
      doc.addPage();
      y = 16;
    }
    const ox = M + (W - 2 * M - L.width * k) / 2;
    // midline and bite line
    doc.setDrawColor(...hex('#e2e8f0')).setLineWidth(0.2);
    doc.line(ox + (L.half + L.gap / 2) * k, y + 8 * k, ox + (L.half + L.gap / 2) * k, y + (L.height - 8) * k);
    doc.line(ox, y + L.occlusalY * k, ox + L.width * k, y + L.occlusalY * k);
    doc.setFontSize(7).setTextColor(...MUTED).text('R', ox - 4, y + L.occlusalY * k + 1).text('L', ox + L.width * k + 2, y + L.occlusalY * k + 1);
    for (const t of L.teeth) {
      drawTooth(doc, t, chart.get(t.tooth)?.condition ?? 'healthy', ox, y, k);
      doc.setFontSize(6).setFont('helvetica', 'normal').setTextColor(...MUTED);
      doc.text(String(t.tooth), ox + (t.x + t.w / 2) * k, y + (t.upper ? L.labelUpperY : L.labelLowerY) * k, { align: 'center' });
    }
    y += L.height * k + 2;
  }
  // legend
  let lx = M;
  doc.setFontSize(7.5);
  for (const c of CONDITIONS) {
    const label = CONDITION_LABEL[c];
    if (lx + 8 + doc.getTextWidth(label) > W - M) {
      lx = M;
      y += 5;
    }
    doc.setFillColor(...hex(CONDITION_COLOR[c])).setDrawColor(...LINE).setLineWidth(0.2).rect(lx, y - 2.6, 3, 3, 'FD');
    doc.setTextColor(...INK).text(label, lx + 4.2, y);
    lx += 4.2 + doc.getTextWidth(label) + 4;
  }
  y += 8;

  // ---- procedures ----
  const toothByProcedure = new Map<string, number[]>();
  for (const e of entries) if (e.procedureId) toothByProcedure.set(e.procedureId, [...(toothByProcedure.get(e.procedureId) ?? []), e.tooth]);
  const totalCost = procedures.reduce((s, p) => s + p.costCents, 0);
  const totalPaid = procedures.reduce((s, p) => s + paidOf(p.id), 0);

  if (y > 262) {
    doc.addPage();
    y = 16;
  }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TEAL).text('Procedure History', M, y);
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
      money(paidOf(p.id)),
      money(p.costCents - paidOf(p.id)),
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

  // ---- payments ----
  if (payments.length) {
    const typeOf = new Map(procedures.map((p) => [p.id, p.type]));
    y = lastTableY(doc) + 8;
    if (y > 262) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TEAL).text('Payments', M, y);
    autoTable(doc, {
      startY: y + 3,
      margin: { left: M, right: M },
      head: [['Date', 'For', 'Method', { content: 'Amount', styles: { halign: 'right' } }, 'Remarks']],
      body: payments.map((pm) => [
        `${formatDate(pm.paidAt)} ${formatTime(pm.paidAt.slice(11))}`,
        typeOf.get(pm.procedureId) ?? '-',
        PAYMENT_METHOD_LABEL[pm.method],
        money(pm.amountCents),
        pm.remarks,
      ]),
      headStyles: { fillColor: TEAL, textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, textColor: INK, cellPadding: 1.8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 3: { halign: 'right' }, 4: { cellWidth: 50 } },
    });
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(...MUTED).setFont('helvetica', 'normal');
    doc.text(`${name} · Confidential patient record`, M, 292);
    doc.text(`Page ${i} of ${pages}`, W - M, 292, { align: 'right' });
  }

  const safe = formatName(patient, { lastFirst: true, middle: 'none' }).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'patient';
  doc.save(`${safe}-record.pdf`);
}
