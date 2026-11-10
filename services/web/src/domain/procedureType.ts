import { OTHER_PROCEDURE, PROCEDURE_TYPES } from '@clinic/shared';

/** What the form shows: a choice from the list, plus free text when the choice is "Other". */
export interface ProcedureTypeInput {
  choice: string;
  other: string;
}

const KNOWN = new Set(PROCEDURE_TYPES.map((t) => t.name).filter((n) => n !== OTHER_PROCEDURE));

/** Stored type → form state. Anything not in the list was typed under "Other". */
export function splitProcedureType(type: string): ProcedureTypeInput {
  if (!type) return { choice: '', other: '' };
  return KNOWN.has(type) ? { choice: type, other: '' } : { choice: OTHER_PROCEDURE, other: type };
}

/** Form state → the type to store ('' when incomplete). */
export function resolveProcedureType(v: ProcedureTypeInput): string {
  return v.choice === OTHER_PROCEDURE ? v.other.trim() : v.choice;
}
