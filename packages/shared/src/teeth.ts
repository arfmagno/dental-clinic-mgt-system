// FDI tooth catalog, chart layout geometry and anatomical tooth outlines.
// Used by the on-screen chart, the PDF export and (catalog) the server's `teeth` table.

export type Dentition = 'permanent' | 'primary';
export type ToothKind = 'molar' | 'premolar' | 'canine' | 'incisor';

const range = (from: number, to: number) => {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let n = from; n !== to + step; n += step) out.push(n);
  return out;
};

export const QUADRANTS: Record<Dentition, { upperRight: number[]; upperLeft: number[]; lowerRight: number[]; lowerLeft: number[] }> = {
  permanent: { upperRight: range(18, 11), upperLeft: range(21, 28), lowerRight: range(48, 41), lowerLeft: range(31, 38) },
  primary: { upperRight: range(55, 51), upperLeft: range(61, 65), lowerRight: range(85, 81), lowerLeft: range(71, 75) },
};

export function dentitionOf(tooth: number): Dentition {
  return Math.floor(tooth / 10) >= 5 ? 'primary' : 'permanent';
}

export function toothKind(tooth: number): ToothKind {
  const pos = tooth % 10;
  if (pos <= 2) return 'incisor';
  if (pos === 3) return 'canine';
  if (dentitionOf(tooth) === 'primary') return 'molar';
  return pos <= 5 ? 'premolar' : 'molar';
}

const POSITION_NAME: Record<Dentition, string[]> = {
  permanent: ['', 'central incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar', 'second molar', 'third molar'],
  primary: ['', 'central incisor', 'lateral incisor', 'canine', 'first molar', 'second molar'],
};

export interface ToothInfo {
  number: number; // FDI
  dentition: Dentition;
  quadrant: number; // 1-4 permanent, 5-8 primary
  position: number; // 1 = central incisor ... 8 = third molar
  kind: ToothKind;
  upper: boolean;
  name: string; // e.g. "Upper right first molar"
}

/** All 52 FDI teeth (32 permanent + 20 primary). Fixed reference data. */
export const TOOTH_CATALOG: readonly ToothInfo[] = (['permanent', 'primary'] as const).flatMap((d) =>
  Object.values(QUADRANTS[d]).flat().sort((a, b) => a - b).map((n): ToothInfo => {
    const quadrant = Math.floor(n / 10);
    const position = n % 10;
    const upper = quadrant % 4 === 1 || quadrant % 4 === 2;
    const right = quadrant % 4 === 1 || quadrant % 4 === 0;
    return {
      number: n,
      dentition: d,
      quadrant,
      position,
      kind: toothKind(n),
      upper,
      name: `${upper ? 'Upper' : 'Lower'} ${right ? 'right' : 'left'} ${POSITION_NAME[d][position]}`,
    };
  }),
);
const BY_NUMBER = new Map(TOOTH_CATALOG.map((t) => [t.number, t]));
export const toothInfo = (n: number) => BY_NUMBER.get(n);
export const isValidTooth = (n: unknown) => typeof n === 'number' && BY_NUMBER.has(n);

// ---------- Anatomical outlines ----------
// Drawn in a 30 × 64 box for an UPPER tooth: roots at the top (y 0–30), crown below (y 30–64).
// Lower teeth are the same outlines mirrored vertically. Paths use only absolute M, L, Q, Z so
// they can be flattened for the PDF (see flattenPath).
export const SHAPE_W = 30;
export const SHAPE_H = 64;

export interface ToothShape {
  crown: string;
  roots: string[];
  /** Root-canal lines (from crown to apex), one per root. */
  canals: string[];
}

const SHAPES = {
  incisor: {
    crown: 'M7 30 L23 30 Q25 46 24 58 Q15 64 6 58 Q5 46 7 30 Z',
    roots: ['M8 31 Q9 12 15 2 Q21 12 22 31 Z'],
    canals: ['M15 34 L15 7'],
  },
  canine: {
    crown: 'M6 30 L24 30 Q26 44 22 54 Q18 61 15 64 Q12 61 8 54 Q4 44 6 30 Z',
    roots: ['M8 31 Q8 10 15 0 Q22 10 22 31 Z'],
    canals: ['M15 34 L15 5'],
  },
  premolarUpper: {
    crown: 'M5 30 L25 30 Q27 44 26 54 Q24 60 20 57 Q15 53 10 57 Q6 60 4 54 Q3 44 5 30 Z',
    roots: ['M6 31 Q6 14 10 4 Q14 14 14 31 Z', 'M16 31 Q16 14 20 4 Q24 14 24 31 Z'],
    canals: ['M10 34 L10 9', 'M20 34 L20 9'],
  },
  premolarLower: {
    crown: 'M5 30 L25 30 Q27 44 26 54 Q24 60 20 57 Q15 53 10 57 Q6 60 4 54 Q3 44 5 30 Z',
    roots: ['M7 31 Q8 12 15 3 Q22 12 23 31 Z'],
    canals: ['M15 34 L15 8'],
  },
  molarUpper: {
    crown: 'M2 30 L28 30 Q30 42 29 54 Q27 61 23 58 Q19 54 15 58 Q11 54 7 58 Q3 61 1 54 Q0 42 2 30 Z',
    roots: ['M3 31 Q2 16 6 6 Q10 16 11 31 Z', 'M11 31 Q12 12 15 4 Q18 12 19 31 Z', 'M19 31 Q20 16 24 6 Q28 16 27 31 Z'],
    canals: ['M7 34 L6 11', 'M15 34 L15 9', 'M23 34 L24 11'],
  },
  molarLower: {
    crown: 'M2 30 L28 30 Q30 42 29 54 Q27 61 23 58 Q19 54 15 58 Q11 54 7 58 Q3 61 1 54 Q0 42 2 30 Z',
    roots: ['M3 31 Q3 14 8 4 Q13 14 13 31 Z', 'M17 31 Q17 14 22 4 Q27 14 27 31 Z'],
    canals: ['M8 34 L8 9', 'M22 34 L22 9'],
  },
} satisfies Record<string, ToothShape>;

export function toothShape(tooth: number): ToothShape {
  const kind = toothKind(tooth);
  const upper = toothInfo(tooth)?.upper ?? true;
  if (kind === 'incisor') return SHAPES.incisor;
  if (kind === 'canine') return SHAPES.canine;
  if (kind === 'premolar') return upper ? SHAPES.premolarUpper : SHAPES.premolarLower;
  return upper ? SHAPES.molarUpper : SHAPES.molarLower;
}

/** Converts an M/L/Q/Z path to polygon points (quadratic curves sampled). Used by the PDF export. */
export function flattenPath(d: string, steps = 6): [number, number][] {
  const tokens = d.match(/[MLQZ]|-?\d*\.?\d+/g) ?? [];
  const pts: [number, number][] = [];
  let i = 0;
  let cur: [number, number] = [0, 0];
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      cur = [num(), num()];
      pts.push(cur);
    } else if (cmd === 'Q') {
      const c: [number, number] = [num(), num()];
      const end: [number, number] = [num(), num()];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, e = t * t;
        pts.push([a * cur[0] + b * c[0] + e * end[0], a * cur[1] + b * c[1] + e * end[1]]);
      }
      cur = end;
    }
  }
  return pts;
}

// ---------- Chart layout ----------
export interface ToothBox {
  tooth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  upper: boolean;
}

/**
 * Geometry shared by the on-screen chart and the PDF. Upper crowns meet lower crowns at the
 * occlusal line in the middle; patient's right is on the viewer's left (standard chart layout).
 */
export function toothLayout(d: Dentition) {
  const q = QUADRANTS[d];
  const cell = d === 'permanent' ? 34 : 46;
  const gap = 18;
  const widthOf: Record<ToothKind, number> = { molar: 31, premolar: 25, canine: 23, incisor: 22 };
  const toothH = d === 'permanent' ? SHAPE_H : 52; // primary teeth are smaller
  const half = q.upperRight.length * cell;
  const width = half * 2 + gap;
  const rowUpperY = 22; // top of the tallest upper tooth
  const rowLowerY = rowUpperY + SHAPE_H + 34; // top of the lower crowns
  const teeth: ToothBox[] = [];
  const place = (list: number[], x0: number, upper: boolean) => {
    list.forEach((tooth, i) => {
      const w = widthOf[toothKind(tooth)];
      teeth.push({
        tooth,
        x: x0 + i * cell + (cell - w) / 2,
        y: upper ? rowUpperY + (SHAPE_H - toothH) : rowLowerY,
        w,
        h: toothH,
        upper,
      });
    });
  };
  place(q.upperRight, 0, true);
  place(q.upperLeft, half + gap, true);
  place(q.lowerRight, 0, false);
  place(q.lowerLeft, half + gap, false);
  return {
    teeth,
    width,
    height: rowLowerY + SHAPE_H + 24,
    half,
    gap,
    rowUpperY,
    rowLowerY,
    occlusalY: rowUpperY + SHAPE_H + 17,
    labelUpperY: rowUpperY - 8,
    labelLowerY: rowLowerY + SHAPE_H + 16,
  };
}
